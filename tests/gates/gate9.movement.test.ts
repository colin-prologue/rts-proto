import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import {
  initialState,
  spawn,
  step,
  hashState,
  fromInt,
  floorToInt,
  type Command,
  type State,
} from '@rts/sim'
import {
  loadComp,
  loadMap,
  runBalance,
  sideSkew,
  type BalanceOptions,
} from '../../apps/headless/src/balance'

// Gate 9 contracts — see docs/build-plan.md Gate 9, docs/decisions/movement-fairness.md, and
// docs/decisions/unit-collision.md. The pieces under test: the flow-field pathfinder behind the
// interface promised in docs/decisions/pathfinding.md, and step() phase 4 rewritten as snapshot
// intents (issue #4 fix) + tile-exclusive collision.

function goldenCheck(file: string, h: number) {
  const path = resolve(`tests/gates/golden/${file}`)
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, String(h >>> 0))
  }
  expect(h >>> 0).toBe(Number(readFileSync(path, 'utf8').trim()))
}

const comp = (name: string) => loadComp(resolve(`tests/gates/fixtures/comps/${name}.json`))
const map = (name: string) => loadMap(resolve(`tests/gates/fixtures/maps/${name}.json`))
const GATE_OPTS: BalanceOptions = { baseSeed: 20260704, seedCount: 64 } // the gate 7/8 seed set

const attack = (playerId: number, unitId: number, targetId: number): Command =>
  ({ type: 'ATTACK', playerId, seq: 0, unitIds: [unitId], payload: { targetId } })
const move = (playerId: number, unitIds: number[], x: number, y: number): Command =>
  ({ type: 'MOVE', playerId, seq: 0, unitIds, payload: { x: fromInt(x), y: fromInt(y) } })

const tileXY = (s: State, id: number): [number, number] => {
  const e = s.entities.find((x) => x.id === id)!
  return [floorToInt(e.x), floorToInt(e.y)]
}

/** No two entities on one floor tile — the collision invariant, checked after a whole tick. */
function expectNoStacks(s: State) {
  const seen = new Map<number, number>()
  for (const e of s.entities) {
    const t = floorToInt(e.y) * s.map.w + floorToInt(e.x)
    const prev = seen.get(t)
    expect(prev, `tick ${s.tick}: entities ${prev} and ${e.id} share tile ${t}`).toBeUndefined()
    seen.set(t, e.id)
  }
}

describe('Gate 9 — movement & collision', () => {
  it('fairness mechanism: mirrored duels are symmetric, melee and ranged (issue #4)', () => {
    // Contract: two identical units, mirrored positions, mutual ATTACK on tick 0 — per-tick hp
    // trajectories are identical for both sides until the duel resolves, for a melee (grunt)
    // and a ranged (archer) pair; each end state hashes to a committed golden. Both units act
    // on the same pre-movement snapshot, so neither can lead the other's position.
    for (const [type, golden] of [
      ['grunt', 'gate9.duel-melee.hash'],
      ['archer', 'gate9.duel-ranged.hash'],
    ] as const) {
      let s = initialState(11)
      s = spawn(s, type, 0, fromInt(10), fromInt(16))
      s = spawn(s, type, 1, fromInt(22), fromInt(16))
      let resolved = false
      for (let i = 0; i < 60; i++) {
        s = step(s, s.tick === 0 ? [attack(0, 2, 3), attack(1, 3, 2)] : [])
        const a = s.entities.find((e) => e.id === 2)
        const b = s.entities.find((e) => e.id === 3)
        expect(a?.hp ?? 0, `${type} tick ${s.tick}: hp diverged`).toBe(b?.hp ?? 0)
        if (!a && !b) {
          resolved = true // identical units, identical information: mutual destruction
          break
        }
      }
      expect(resolved, `${type} duel should resolve by mutual death`).toBe(true)
      goldenCheck(golden, hashState(s))
    }
  })

  it('fairness at population: the open-arena mirror skew collapses below the pre-fix baseline', () => {
    // Contract: grunt-pack vs ITSELF on the default arena over the gate seed set — the side
    // skew falls strictly below 32, the pre-fix baseline measured at planning time on
    // main @ 1569eed (slot0 18 / slot1 50). Post-fix it measures 0 (slot0 60 / slot1 60);
    // asserting the committed baseline rather than the exact value keeps the check about the
    // mechanism, not about one seed set's noise floor.
    const mirror = comp('grunt-pack')
    const open = sideSkew(runBalance(mirror, mirror, GATE_OPTS))
    expect(open.skew).toBeLessThan(32)
  })

  it('collision has teeth: a converge order packs around the point, one entity per tile', () => {
    // Contract: a squad spawned on distinct tiles and ordered to one point — after every tick,
    // no two entities share a floor tile; the squad packs within Chebyshev radius 2 of the
    // destination and comes to rest via arrival relaxation (five extra ticks move nobody).
    let s = initialState(21)
    const spots: [number, number][] = [
      [10, 10], [12, 10], [14, 10], [10, 12], [14, 12], [10, 14], [12, 14], [14, 14],
    ]
    for (const [x, y] of spots) s = spawn(s, 'grunt', 0, fromInt(x), fromInt(y))
    const ids = s.entities.filter((e) => e.type === 'grunt').map((e) => e.id)
    expect(ids.length).toBe(8)
    for (let i = 0; i < 40; i++) {
      s = step(s, s.tick === 0 ? [move(0, ids, 20, 20)] : [])
      expectNoStacks(s)
    }
    for (const id of ids) {
      const [x, y] = tileXY(s, id)
      expect(Math.max(Math.abs(x - 20), Math.abs(y - 20)), `unit ${id} did not pack`).toBeLessThanOrEqual(2)
      expect(s.entities.find((e) => e.id === id)!.target, `unit ${id} never came to rest`).toBeUndefined()
    }
    const rest = s.entities.map((e) => [e.id, e.x, e.y])
    for (let i = 0; i < 5; i++) s = step(s, [])
    expect(s.entities.map((e) => [e.id, e.x, e.y])).toEqual(rest)
    goldenCheck('gate9.converge.hash', hashState(s))
  })

  it('no walking through units: a stationary blocker is routed around, never overlapped', () => {
    // Contract: a unit ordered through a stationary blocker sitting on the straight-line path
    // never shares the blocker's tile at any tick, still arrives, and the blocker never moves.
    let s = initialState(31)
    s = spawn(s, 'grunt', 0, fromInt(10), fromInt(10)) // id 2: the mover
    s = spawn(s, 'grunt', 0, fromInt(13), fromInt(10)) // id 3: the blocker, no orders
    for (let i = 0; i < 12; i++) {
      s = step(s, s.tick === 0 ? [move(0, [2], 16, 10)] : [])
      expectNoStacks(s)
      expect(tileXY(s, 3)).toEqual([13, 10]) // the blocker was never shoved
    }
    expect(tileXY(s, 2)).toEqual([16, 10]) // the mover routed around and arrived
    goldenCheck('gate9.blocker.hash', hashState(s))
  })

  it('flow fields route: the gate-8 choke order now arrives through the gap', () => {
    // Contract: on the committed choke-corridor fixture, the gate-8 scenario's order (unit at
    // (5,8) sent to (26,8), straight line through the wall band) ARRIVES within 60 ticks,
    // occupying only passable tiles at every tick. This supersedes gate 8's stopped-at-the-wall
    // assertion, per the build-plan's declared supersession; gate 8 keeps the wall invariant.
    const choke = map('choke-corridor')
    let s = initialState(42, undefined, { ...choke.map, flags: [...choke.map.flags] })
    s = spawn(s, 'grunt', 0, fromInt(5), fromInt(8))
    let arrived = 0
    for (let i = 0; i < 60; i++) {
      s = step(s, s.tick === 0 ? [move(0, [2], 26, 8)] : [])
      const [x, y] = tileXY(s, 2)
      expect(
        choke.map.flags[y * choke.map.w + x] & 1,
        `tick ${s.tick}: grunt inside a wall at (${x}, ${y})`
      ).toBe(1)
      if (x === 26 && y === 8 && arrived === 0) arrived = s.tick
    }
    expect(arrived, 'the unit never reached (26, 8)').toBeGreaterThan(0)
    expect(arrived).toBeLessThanOrEqual(60)
    expect(s.entities.find((e) => e.id === 2)!.target).toBeUndefined() // order completed
    goldenCheck('gate9.choke-route.hash', hashState(s))
  })

  it('armies move: 40 grunts cross the choke, ≥90% arrive, never stacked', () => {
    // Contract: 40 grunts on the choke-corridor fixture ordered to the far side; at least 90%
    // end beyond the wall band (x > 16) within 300 ticks; after every tick's movement no two
    // entities share a tile. The charter's 40-unit-army question, made mechanical.
    const choke = map('choke-corridor')
    let s = initialState(52, undefined, { ...choke.map, flags: [...choke.map.flags] })
    for (let y = 12; y < 20; y++) {
      for (let x = 3; x < 8; x++) s = spawn(s, 'grunt', 0, fromInt(x), fromInt(y))
    }
    const ids = s.entities.filter((e) => e.type === 'grunt').map((e) => e.id)
    expect(ids.length).toBe(40)
    for (let i = 0; i < 300; i++) {
      s = step(s, s.tick === 0 ? [move(0, ids, 26, 16)] : [])
      expectNoStacks(s)
    }
    const across = ids.filter((id) => tileXY(s, id)[0] > 16).length
    expect(across, `only ${across}/40 crossed the wall band`).toBeGreaterThanOrEqual(36)
    goldenCheck('gate9.army.hash', hashState(s))
  })

  it('combat never stacks: a pack fight keeps one entity per tile throughout', () => {
    // Strengthening from Gate 9 human review (Colin, 2026-07-06): the movement scenarios above
    // assert tile exclusivity, but no COMBAT scenario did — fights relied on the code path
    // alone, and stacking is not visually verifiable in the viewer. Contract: two packs
    // spawned on distinct tiles and thrown at each other never share a tile at any tick,
    // through approach, melee, and deaths, until one side is eliminated.
    let s = initialState(61)
    for (let i = 0; i < 5; i++) {
      s = spawn(s, 'grunt', 0, fromInt(8), fromInt(12 + i * 2))
      s = spawn(s, 'grunt', 1, fromInt(24), fromInt(12 + i * 2))
    }
    const side = (owner: number) => s.entities.filter((e) => e.type === 'grunt' && e.owner === owner)
    expectNoStacks(s) // distinct spawns — the invariant is unconditional from tick 0
    const orders: Command[] = []
    for (let i = 0; i < 5; i++) {
      orders.push(attack(0, side(0)[i].id, side(1)[i].id))
      orders.push(attack(1, side(1)[i].id, side(0)[i].id))
    }
    for (let i = 0; i < 120 && side(0).length > 0 && side(1).length > 0; i++) {
      // re-target survivors at the lowest-id living enemy so the fight runs to elimination
      const retarget: Command[] = []
      for (const owner of [0, 1]) {
        const foes = side(1 - owner)
        for (const u of side(owner)) {
          if (u.attackTarget === undefined && foes.length > 0) {
            retarget.push(attack(owner, u.id, foes[0].id))
          }
        }
      }
      s = step(s, s.tick === 0 ? orders : retarget)
      expectNoStacks(s)
    }
    expect(side(0).length === 0 || side(1).length === 0, 'the fight should reach elimination').toBe(true)
    goldenCheck('gate9.packfight.hash', hashState(s))
  })

  it('the movement-fairness decision record is ratified (not a proposal)', () => {
    const record = readFileSync(resolve('docs/decisions/movement-fairness.md'), 'utf8')
    expect(record, 'flip **Status:** to decided when ratifying').toMatch(/status[^a-z\n]*decided/i)
  })

  it('the unit-collision decision record is ratified (not a proposal)', () => {
    const record = readFileSync(resolve('docs/decisions/unit-collision.md'), 'utf8')
    expect(record, 'flip **Status:** to decided when ratifying').toMatch(/status[^a-z\n]*decided/i)
  })
})
