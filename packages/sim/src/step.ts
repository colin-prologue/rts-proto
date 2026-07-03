import type { State, Entity, Player } from './types'
import { TILE_PASSABLE } from './types'
import type { Command } from './command-types'
import type { SimEvent } from './events'
import { sortCommands } from './commands'
import { type Fixed, fromInt, add, sub, neg, cmp, floorToInt } from './fixed'
import { GATHER_PERIOD, tableDamage, type UnitSpec } from './data'

// The pure reducer: state(n+1) = step(state(n), commands(n)).
// Phases run in a fixed order, each iterating entities in stable id order (the entities array is
// kept sorted by id — ids only ever increase): 1 apply sorted commands, 2 construction+production,
// 3 gathering, 4 movement, 5 combat (simultaneous damage), 6 deaths. No I/O, no clock — any
// randomness must be drawn from state.rng and threaded back (CONSTITUTION I–IV).

/** One axis of grid movement: advance `from` toward `to`, at most `speed` per tick. */
function stepToward(from: Fixed, to: Fixed, speed: Fixed): Fixed {
  const d = sub(to, from)
  if (cmp(d, neg(speed)) < 0) return sub(from, speed)
  if (cmp(d, speed) > 0) return add(from, speed)
  return to
}

/** Chebyshev distance check — no sqrt, no transcendentals in the sim. */
function inRange(a: Entity, b: Entity, range: number): boolean {
  const dx = Math.abs((a.x as number) - (b.x as number))
  const dy = Math.abs((a.y as number) - (b.y as number))
  return Math.max(dx, dy) <= (fromInt(range) as number)
}

function passable(s: State, x: Fixed, y: Fixed): boolean {
  const tx = floorToInt(x)
  const ty = floorToInt(y)
  if (tx < 0 || ty < 0 || tx >= s.map.w || ty >= s.map.h) return false
  return (s.map.flags[ty * s.map.w + tx] & TILE_PASSABLE) !== 0
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
  for (const e of entities) {
    const spec = specs[e.type]
    if ((spec?.speed ?? 0) <= 0) continue
    if (e.attackTarget !== undefined) {
      const t = byId.get(e.attackTarget)
      if (t && !inRange(e, t, spec.range)) e.target = { x: t.x, y: t.y }
      else delete e.target
    }
    if (!e.target) continue
    const speed = fromInt(spec.speed)
    const nx = stepToward(e.x, e.target.x, speed)
    const ny = stepToward(e.y, e.target.y, speed)
    if (passable(state, nx, ny)) {
      e.x = nx
      e.y = ny
    } else {
      delete e.target // blocked by terrain — stop rather than grind (flow fields land later)
      continue
    }
    if (e.x === e.target.x && e.y === e.target.y) delete e.target
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
    rng: state.rng,
    entities: survivors,
    players,
    nextEntityId,
    map: state.map,
    data: state.data,
  }
}
