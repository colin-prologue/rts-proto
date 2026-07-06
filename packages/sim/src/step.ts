import type { State, Entity, Player } from './types'
import type { Command } from './command-types'
import type { SimEvent } from './events'
import { sortCommands } from './commands'
import { rngU32 } from './rng'
import { type Fixed, fromInt, add, sub, neg, cmp, floorToInt } from './fixed'
import { GATHER_PERIOD, tableDamage, type UnitSpec } from './data'
import { createPathfinder, nextTile, passableTile, UNREACHABLE } from './pathfinder'
import { nearestPassable } from './map-fixture'

// The pure reducer: state(n+1) = step(state(n), commands(n)).
// Phases run in a fixed order, each iterating entities in stable id order (the entities array is
// kept sorted by id — ids only ever increase): 1 apply sorted commands, 2 construction+production,
// 3 gathering, 4 movement (snapshot intents, then collision-checked application), 5 combat
// (simultaneous damage), 6 deaths. No I/O, no clock — any randomness must be drawn from
// state.rng and threaded back (CONSTITUTION I–IV).

/** One axis of grid movement: advance `from` toward `to`, at most `speed` per tick. */
function stepToward(from: Fixed, to: Fixed, speed: Fixed): Fixed {
  const d = sub(to, from)
  if (cmp(d, neg(speed)) < 0) return sub(from, speed)
  if (cmp(d, speed) > 0) return add(from, speed)
  return to
}

/** Chebyshev distance check — no sqrt, no transcendentals in the sim. */
function inRangeAt(ax: Fixed, ay: Fixed, bx: Fixed, by: Fixed, range: number): boolean {
  const dx = Math.abs((ax as number) - (bx as number))
  const dy = Math.abs((ay as number) - (by as number))
  return Math.max(dx, dy) <= (fromInt(range) as number)
}

function inRange(a: Entity, b: Entity, range: number): boolean {
  return inRangeAt(a.x, a.y, b.x, b.y, range)
}

function supplyCap(entities: Entity[], specs: Record<string, UnitSpec>, playerId: number): number {
  let cap = 0
  for (const e of entities) {
    if (e.owner !== playerId || (e.constructing ?? 0) > 0) continue
    cap += specs[e.type]?.provides ?? 0
  }
  return cap
}

export function step(state: State, commands: Command[], events?: SimEvent[]): State {
  const specs = state.data.units
  const entities: Entity[] = state.entities.map((e) => ({
    ...e,
    target: e.target ? { ...e.target } : undefined,
    queue: e.queue ? e.queue.map((q) => ({ ...q })) : undefined,
  }))
  const players: Player[] = state.players.map((p) => ({ ...p }))
  let nextEntityId = state.nextEntityId
  const byId = new Map(entities.map((e) => [e.id, e]))
  const playerById = new Map(players.map((p) => [p.id, p]))
  // Events are pure output (docs/decisions/sim-events.md): plain data pushed to the caller's
  // array, never read back. When no array is passed, emission is a no-op.
  const emit = (e: SimEvent) => events?.push(e)

  const spawn = (type: string, owner: number, x: Fixed, y: Fixed, constructing = 0): number => {
    const spec = specs[type]
    const e: Entity = { id: nextEntityId++, type, owner, x, y, hp: spec.hp }
    if (constructing > 0) e.constructing = constructing
    if (spec.amount !== undefined) e.amount = spec.amount
    entities.push(e) // ids only increase, so pushing keeps the sorted-by-id invariant
    byId.set(e.id, e)
    emit({ kind: 'SPAWN', id: e.id, type, owner })
    return e.id
  }

  // -- 1. commands, in (playerId, seq) order ------------------------------------------------
  for (const c of sortCommands(commands)) {
    switch (c.type) {
      case 'MOVE': {
        const p = c.payload as { x: Fixed; y: Fixed }
        for (const id of c.unitIds) {
          const u = byId.get(id)
          // playerId is the only identity a lockstep command carries — a unit not owned by the
          // issuer is silently ignored, here and in every order-giving handler below.
          if (u && u.owner === c.playerId && (specs[u.type]?.speed ?? 0) > 0) {
            u.target = { x: p.x, y: p.y }
            delete u.attackTarget
            delete u.gatherTarget
          }
        }
        break
      }
      case 'STOP': {
        for (const id of c.unitIds) {
          const u = byId.get(id)
          if (u && u.owner === c.playerId) {
            delete u.target
            delete u.attackTarget
            delete u.gatherTarget
          }
        }
        break
      }
      case 'ATTACK': {
        const p = c.payload as { targetId: number }
        for (const id of c.unitIds) {
          const u = byId.get(id)
          if (u && u.owner === c.playerId && (specs[u.type]?.damage ?? 0) > 0) {
            u.attackTarget = p.targetId
            delete u.gatherTarget
          }
        }
        break
      }
      case 'GATHER': {
        const p = c.payload as { nodeId: number }
        for (const id of c.unitIds) {
          const u = byId.get(id)
          if (u && u.owner === c.playerId && (specs[u.type]?.gather ?? 0) > 0) {
            u.gatherTarget = p.nodeId
            delete u.attackTarget
          }
        }
        break
      }
      case 'BUILD': {
        const p = c.payload as { unit: string; x: Fixed; y: Fixed }
        const spec = specs[p.unit]
        const player = playerById.get(c.playerId)
        if (spec && player && player.minerals >= spec.cost) {
          player.minerals -= spec.cost
          spawn(p.unit, c.playerId, p.x, p.y, spec.buildTime)
        }
        break
      }
      case 'TRAIN': {
        const p = c.payload as { unit: string }
        const spec = specs[p.unit]
        const player = playerById.get(c.playerId)
        for (const id of c.unitIds) {
          const b = byId.get(id)
          if (!b || !spec || !player) continue
          if (b.owner !== c.playerId || (b.constructing ?? 0) > 0) continue
          if (!specs[b.type]?.trains?.includes(p.unit)) continue
          if (player.minerals < spec.cost) {
            emit({ kind: 'TRAIN_BLOCKED', building: b.id, unit: p.unit, reason: 'minerals' })
            continue
          }
          // Supply is reserved at enqueue and released on death — overproduction is blocked here.
          if (player.supplyUsed + spec.supply > supplyCap(entities, specs, c.playerId)) {
            emit({ kind: 'TRAIN_BLOCKED', building: b.id, unit: p.unit, reason: 'supply' })
            continue
          }
          player.minerals -= spec.cost
          player.supplyUsed += spec.supply
          ;(b.queue ??= []).push({ unit: p.unit, remaining: spec.buildTime })
          emit({ kind: 'TRAIN_START', building: b.id, unit: p.unit })
        }
        break
      }
    }
  }

  // -- 2. construction + production ---------------------------------------------------------
  for (const e of entities) {
    if ((e.constructing ?? 0) > 0) {
      e.constructing!--
      if (e.constructing === 0) delete e.constructing
      continue // a building under construction does not produce
    }
    const head = e.queue?.[0]
    if (head) {
      head.remaining--
      if (head.remaining <= 0) {
        e.queue!.shift()
        if (e.queue!.length === 0) delete e.queue
        const id = spawn(head.unit, e.owner, add(e.x, fromInt(1)), e.y)
        emit({ kind: 'TRAIN_DONE', building: e.id, unit: head.unit, id })
      }
    }
  }

  // -- 3. gathering ---------------------------------------------------------------------------
  for (const e of entities) {
    if (e.gatherTarget === undefined) continue
    const node = byId.get(e.gatherTarget)
    const rate = specs[e.type]?.gather ?? 0
    if (!node || (node.amount ?? 0) <= 0 || rate <= 0) {
      delete e.gatherTarget
      continue
    }
    if (inRange(e, node, 1)) {
      delete e.target
      if (state.tick % GATHER_PERIOD === 0) {
        const take = Math.min(rate, node.amount!)
        node.amount! -= take
        const player = playerById.get(e.owner)
        if (player) player.minerals += take
        emit({ kind: 'GATHER', worker: e.id, node: node.id, amount: take })
      }
    } else {
      e.target = { x: node.x, y: node.y } // walk to the node
    }
  }

  // -- 4. movement (approach for out-of-range attackers happens here too) ----------------------
  // Two passes in stable id order (docs/decisions/movement-fairness.md): every unit's targeting
  // and desired step are computed against a snapshot of positions taken here, so nobody acts on
  // a same-tick move — the issue-#4 information asymmetry is gone by construction. Application
  // then enforces one entity per tile (docs/decisions/unit-collision.md): a tile vacated by an
  // earlier id is free to a later one, contested tiles go to the lower id.
  const map = state.map
  const pathfinder = createPathfinder(map)
  const tileOf = (e: Entity) => floorToInt(e.y) * map.w + floorToInt(e.x)
  const snap = new Map<number, { x: Fixed; y: Fixed }>()
  for (const e of entities) snap.set(e.id, { x: e.x, y: e.y })
  // Tile occupancy as counts: spawn stacks are legal, movement never creates a new one.
  const occ = new Map<number, number>()
  const movers = new Map<number, number>()
  const bump = (m: Map<number, number>, k: number, d: number) => {
    const v = (m.get(k) ?? 0) + d
    if (v === 0) m.delete(k)
    else m.set(k, v)
  }
  for (const e of entities) bump(occ, tileOf(e), 1)

  // Intent pass: attack approach reads the snapshot; a mover is any entity that wants to move
  // this tick — for arrival relaxation, occupants that never intended to move count as terrain.
  interface Intent {
    e: Entity
    spec: UnitSpec
    destX: number
    destY: number
    exact: boolean // destination tile is the order's own tile (finish walks to exact coords)
  }
  const intents: Intent[] = []
  for (const e of entities) {
    const spec = specs[e.type]
    if ((spec?.speed ?? 0) <= 0) continue
    if (e.attackTarget !== undefined) {
      const t = byId.get(e.attackTarget)
      const tp = t && snap.get(t.id)
      if (tp && !inRangeAt(e.x, e.y, tp.x, tp.y, spec.range)) e.target = { x: tp.x, y: tp.y }
      else delete e.target
    }
    if (!e.target) continue
    let destX = floorToInt(e.target.x)
    let destY = floorToInt(e.target.y)
    let exact = true
    if (!passableTile(map, destX, destY)) {
      // A MOVE into a wall walks to the nearest ground beside it instead of grinding at it.
      ;({ x: destX, y: destY } = nearestPassable(map, destX, destY))
      exact = false
    }
    intents.push({ e, spec, destX, destY, exact })
    bump(movers, tileOf(e), 1)
  }

  // Application pass: follow the flow field one tile per speed point, under tile exclusivity.
  // Contested tiles go to whichever mover applies first. A fixed ascending order would hand
  // that edge to lower ids — player 0, by spawn order — every single tick (measured: mirror-
  // matchup slot skew 196/972, z≈6), so each tick draws the direction from the sim's seeded
  // RNG: one draw at a fixed point in the phase (CONSTITUTION III — the draw order is part of
  // the contract), unbiased and uncorrelated with contact geometry by construction, unlike any
  // deterministic schedule such as tick parity (docs/decisions/unit-collision.md).
  const occupancy = (tile: number): 'free' | 'mover' | 'stationary' =>
    (occ.get(tile) ?? 0) === 0 ? 'free' : (movers.get(tile) ?? 0) > 0 ? 'mover' : 'stationary'
  const [dirDraw, rngAfterMove] = rngU32(state.rng)
  const ordered = (dirDraw & 1) === 0 ? intents : [...intents].reverse()
  for (const it of ordered) {
    const { e, spec } = it
    const field = pathfinder.fieldTo(it.destX, it.destY)
    if (field.costAt(floorToInt(e.x), floorToInt(e.y)) === UNREACHABLE) {
      delete e.target // no path (walled off) — stop rather than grind
      continue
    }
    for (let leg = 0; leg < spec.speed && e.target; leg++) {
      const cx = floorToInt(e.x)
      const cy = floorToInt(e.y)
      if (field.costAt(cx, cy) === 0) {
        // On the destination tile: walk to the exact ordered coords (sub-tile), unless the
        // order pointed into a wall and this tile is only its nearest reachable stand-in.
        if (!it.exact) {
          delete e.target
          break
        }
        e.x = stepToward(e.x, e.target.x, fromInt(spec.speed - leg))
        e.y = stepToward(e.y, e.target.y, fromInt(spec.speed - leg))
        if (e.x === e.target.x && e.y === e.target.y) delete e.target
        break
      }
      const { tile, stall } = nextTile(map, field, cx, cy, it.destX, it.destY, occupancy)
      if (tile === null) {
        // Every strictly better tile held by something that is not going anywhere: the order
        // is as complete as it can get (arrival relaxation). A queue of movers keeps waiting.
        if (stall === 'blocked-stationary') delete e.target
        break
      }
      const from = cy * map.w + cx
      bump(occ, from, -1)
      bump(occ, tile, 1)
      bump(movers, from, -1)
      bump(movers, tile, 1)
      e.x = fromInt(tile % map.w)
      e.y = fromInt((tile - (tile % map.w)) / map.w)
      if (e.x === e.target.x && e.y === e.target.y) delete e.target
    }
  }

  // -- 5. combat: all attacks resolve simultaneously, then damage applies ----------------------
  const damage = new Map<number, number>()
  for (const e of entities) {
    if (e.attackTarget === undefined) continue
    const spec = specs[e.type]
    const t = byId.get(e.attackTarget)
    if (!t || t.hp <= 0) {
      delete e.attackTarget
      continue
    }
    if (inRange(e, t, spec.range)) {
      const dealt = tableDamage(state.data, spec.damageType, specs[t.type].armor, spec.damage)
      damage.set(t.id, (damage.get(t.id) ?? 0) + dealt)
      emit({ kind: 'DAMAGE', attacker: e.id, target: t.id, amount: dealt })
    }
  }
  for (const [id, dmg] of damage) {
    const t = byId.get(id)
    if (t) t.hp -= dmg
  }

  // -- 6. deaths: release supply, drop corpses and dangling references --------------------------
  const survivors = entities.filter((e) => e.hp > 0)
  if (survivors.length !== entities.length) {
    const alive = new Set(survivors.map((e) => e.id))
    for (const e of entities) {
      if (e.hp > 0) continue
      const player = playerById.get(e.owner)
      if (player) {
        player.supplyUsed -= specs[e.type]?.supply ?? 0
        // Supply was reserved at enqueue — a producer dying discards its queue, so the
        // reservation must be released too or the player is permanently over cap.
        // (Minerals are deliberately NOT refunded: losing a producing building costs its queue.)
        for (const q of e.queue ?? []) player.supplyUsed -= specs[q.unit]?.supply ?? 0
      }
      emit({ kind: 'DEATH', id: e.id, type: e.type, owner: e.owner })
    }
    for (const e of survivors) {
      if (e.attackTarget !== undefined && !alive.has(e.attackTarget)) delete e.attackTarget
      if (e.gatherTarget !== undefined && !alive.has(e.gatherTarget)) delete e.gatherTarget
    }
  }

  return {
    tick: state.tick + 1,
    rng: rngAfterMove,
    entities: survivors,
    players,
    nextEntityId,
    map: state.map,
    data: state.data,
  }
}
