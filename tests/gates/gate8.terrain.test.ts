import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import {
  initialState,
  spawn,
  step,
  replay,
  hashState,
  fromInt,
  floorToInt,
  buildReplayInitial,
  parseMap,
  TILE_PASSABLE,
  REPLAY_VERSION,
  type Command,
  type State,
  type ReplayFile,
  type WorldMap,
} from '@rts/sim'
import { createProjection, terrainTiles } from '@rts/render'
import {
  loadMap,
  loadComp,
  runBalance,
  exportRun,
  makeSetup,
  serializeReport,
  reportHash,
  sideSkew,
  type BalanceOptions,
} from '../../apps/headless/src/balance'

// Gate 8 contracts — see docs/build-plan.md Gate 8 and docs/decisions/maps-as-data.md.
// The gate matchup, seed set, and fixture maps are fixed here; hashes are pinned by committed
// goldens. The gate 7 seed set is reused so the no-map report check anchors to the same golden.

const golden = (file: string) => Number(readFileSync(resolve(`tests/gates/golden/${file}`), 'utf8').trim())

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
const GATE_OPTS: BalanceOptions = { baseSeed: 20260704, seedCount: 64 } // the gate 7 seed set

const cmd = (type: Command['type'], playerId: number, seq: number, unitIds: number[], payload?: unknown): Command =>
  ({ type, playerId, seq, unitIds, payload })

// The gate-1 scenario, byte-for-byte (tests/gates/gate1.determinism.test.ts).
function runGate1(): State {
  const move = (seq: number): Command =>
    ({ type: 'MOVE', playerId: 0, seq, unitIds: [1], payload: { x: fromInt(5), y: fromInt(5) } })
  let s = initialState(1234)
  for (const cmds of [[move(0)], [], [move(1)], [], []]) s = step(s, cmds)
  return s
}

// The gate-3 economy scenario, byte-for-byte (tests/gates/gate3.rtsloop.test.ts).
function runEconomy(): State {
  let s = initialState(99)
  s = spawn(s, 'depot', 0, fromInt(10), fromInt(10))
  s = spawn(s, 'minerals', -1, fromInt(12), fromInt(10))
  s = spawn(s, 'worker', 0, fromInt(11), fromInt(10))
  const commandsAt: Record<number, Command[]> = {
    0: [cmd('GATHER', 0, 0, [4], { nodeId: 3 }), cmd('TRAIN', 0, 1, [2], { unit: 'grunt' })],
    20: [cmd('TRAIN', 0, 0, [2], { unit: 'archer' })],
  }
  for (let i = 0; i < 60; i++) s = step(s, commandsAt[s.tick] ?? [])
  return s
}

// The gate-3 combat scenario, byte-for-byte.
function runCombat(): State {
  let s = initialState(7)
  s = spawn(s, 'grunt', 0, fromInt(10), fromInt(10))
  s = spawn(s, 'grunt', 0, fromInt(10), fromInt(11))
  s = spawn(s, 'archer', 1, fromInt(14), fromInt(10))
  s = spawn(s, 'archer', 1, fromInt(14), fromInt(11))
  const commandsAt: Record<number, Command[]> = {
    0: [
      cmd('ATTACK', 0, 0, [2], { targetId: 4 }),
      cmd('ATTACK', 0, 1, [3], { targetId: 5 }),
      cmd('ATTACK', 1, 0, [4], { targetId: 2 }),
      cmd('ATTACK', 1, 1, [5], { targetId: 3 }),
    ],
  }
  for (let i = 0; i < 30; i++) s = step(s, commandsAt[s.tick] ?? [])
  return s
}

const onPassable = (m: WorldMap, s: State, id: number) => {
  const e = s.entities.find((x) => x.id === id)!
  const tx = floorToInt(e.x)
  const ty = floorToInt(e.y)
  return (m.flags[ty * m.w + tx] & TILE_PASSABLE) !== 0
}

const outcomes = (r: ReturnType<typeof runBalance>) => r.runs.map((row) => `${row.winner}:${row.ticks}`)

describe('Gate 8 — maps & terrain as data', () => {
  it('a map is a data fixture: parse a committed fixture, add a second with no code change', () => {
    // Contract: a committed JSON map fixture ({ name, tiles, spawns }, legend '.'/'#') parses
    // to a WorldMap; a SECOND committed fixture loads and runs through the same path with no
    // sim or harness code change — adding a map is adding a file.
    const choke = map('choke-corridor')
    expect(choke.map.w).toBe(32)
    expect(choke.map.h).toBe(32)
    expect(choke.map.flags.length).toBe(32 * 32)
    expect(choke.map.flags[8 * 32 + 15] & TILE_PASSABLE).toBe(0) // wall
    expect(choke.map.flags[16 * 32 + 15] & TILE_PASSABLE).toBe(TILE_PASSABLE) // the gap
    expect(choke.spawns).toEqual([
      { x: 8, y: 16 },
      { x: 23, y: 16 },
    ])
    // the second committed fixture runs through the identical load->report path
    const second = map('lopsided-gate')
    const r = runBalance(comp('grunt-pack'), comp('archer-pack'), { baseSeed: 7, seedCount: 4, map: second })
    expect(r.matchup.map).toBe('lopsided-gate')
    expect(r.runs.length).toBe(8)
  })

  it('small and edge-anchored maps keep formations inside their own bounds, on passable tiles', () => {
    // A valid fixture smaller than the default arena's interior margin must be honored as
    // declared: setup positions clamp to the map's true bounds and nudge onto passable tiles —
    // never dragged into a hard-coded [2, w-3] interior the map cannot support (PR #12 review).
    const tiny = parseMap({
      name: 'tiny-arena',
      tiles: ['......', '.#..#.', '......', '......', '......'],
      spawns: [
        { x: 0, y: 2 },
        { x: 5, y: 2 },
      ],
    })
    const setup = makeSetup(comp('grunt-pack'), comp('grunt-pack'), 12345, 0, tiny)
    expect(setup.length).toBe(14)
    for (const row of setup) {
      expect(row.x).toBeGreaterThanOrEqual(0)
      expect(row.x).toBeLessThan(6)
      expect(row.y).toBeGreaterThanOrEqual(0)
      expect(row.y).toBeLessThan(5)
      expect(tiny.map.flags[row.y * 6 + row.x] & TILE_PASSABLE).toBe(TILE_PASSABLE)
    }
    // both declared anchors are actually used: each side's rows cluster around its own spawn
    const side0 = setup.slice(0, 7)
    const side1 = setup.slice(7)
    expect(Math.min(...side0.map((r) => r.x))).toBeLessThanOrEqual(1)
    expect(Math.max(...side1.map((r) => r.x))).toBeGreaterThanOrEqual(4)
  })

  it('terrain has teeth: a unit ordered through a choke wall never enters it', () => {
    // Contract: on the committed choke fixture, order a unit through the impassable band; at
    // every tick the unit occupies only passable tiles, and the scenario end state hashes to a
    // committed golden under tests/gates/golden/gate8.choke.hash.
    const choke = map('choke-corridor')
    let s = initialState(42, undefined, { ...choke.map, flags: [...choke.map.flags] })
    s = spawn(s, 'grunt', 0, fromInt(5), fromInt(8))
    const move: Command = { type: 'MOVE', playerId: 0, seq: 0, unitIds: [2], payload: { x: fromInt(26), y: fromInt(8) } }
    for (let i = 0; i < 30; i++) {
      s = step(s, s.tick === 0 ? [move] : [])
      expect(onPassable(choke.map, s, 2), `tick ${s.tick}: grunt inside a wall`).toBe(true)
    }
    const grunt = s.entities.find((e) => e.id === 2)!
    expect(floorToInt(grunt.x)).toBeGreaterThan(5) // it did march
    expect(floorToInt(grunt.x)).toBeLessThan(15) // and the wall stopped it
    goldenCheck('gate8.choke.hash', hashState(s))
  })

  it('the sim default path is untouched: no previously committed golden moves', () => {
    // Contract: re-run the gate 1/3/4 golden scenarios and the gate 7 balance report after maps
    // land; every hash still equals its committed golden. The no-map path is byte-identical —
    // the report only gains a map field when a map is given.
    expect(hashState(runGate1()) >>> 0).toBe(golden('gate1.hash'))
    expect(hashState(runEconomy()) >>> 0).toBe(golden('gate3.economy.hash'))
    expect(hashState(runCombat()) >>> 0).toBe(golden('gate3.combat.hash'))
    const file = JSON.parse(
      readFileSync(resolve('apps/playground/public/replays/gate4-match.json'), 'utf8')
    ) as ReplayFile
    expect(hashState(replay(buildReplayInitial(file), file.log)) >>> 0).toBe(golden('gate4.match.hash'))
    const defaultReport = serializeReport(runBalance(comp('grunt-pack'), comp('archer-pack'), GATE_OPTS))
    expect(defaultReport).not.toContain('"map"') // no map key on the no-map path
    expect(reportHash(defaultReport)).toBe(golden('gate7.balance.hash'))
  })

  it('replay v2 round-trips: an exported --map run embeds its map and replays to its endHash', () => {
    // Contract: export one run from a --map report; the file carries v: 2 and an embedded
    // map { w, h, flags }; replay(buildReplayInitial(file), file.log) === the row's endHash.
    // One run per winner, so both orientations of the export path are exercised.
    const choke = map('choke-corridor')
    const opts: BalanceOptions = { ...GATE_OPTS, map: choke }
    const r = runBalance(comp('grunt-pack'), comp('archer-pack'), opts)
    for (const target of ['A', 'B'] as const) {
      const row = r.runs.find((x) => x.winner === target)!
      expect(row).toBeDefined()
      const file = exportRun(comp('grunt-pack'), comp('archer-pack'), opts, row.run)
      expect(file.v).toBe(REPLAY_VERSION)
      expect(file.map).toEqual(choke.map)
      expect(file.name).toContain('-on-choke-corridor-')
      expect(file.log.length).toBe(row.ticks)
      const end = replay(buildReplayInitial(file), file.log)
      expect(hashState(end) >>> 0).toBe(row.endHash)
    }
  })

  it('v1 replays stay valid and unknown versions are refused', () => {
    // Contract: the committed gate4-match.json (no v field) still re-simulates to the committed
    // gate4.match.hash through the same loader; a file with an unknown version, a map without
    // v: 2, or a v: 2 without a map is refused with a loud error, never misread.
    const file = JSON.parse(
      readFileSync(resolve('apps/playground/public/replays/gate4-match.json'), 'utf8')
    ) as ReplayFile
    expect(file.v).toBeUndefined() // the committed fixture really is a v1 file
    expect(hashState(replay(buildReplayInitial(file), file.log)) >>> 0).toBe(golden('gate4.match.hash'))
    const m = map('choke-corridor').map
    expect(() => buildReplayInitial({ ...file, v: 3, map: m })).toThrow(/unknown version 3/)
    expect(() => buildReplayInitial({ ...file, v: REPLAY_VERSION })).toThrow(/requires an embedded map/)
    expect(() => buildReplayInitial({ ...file, map: m })).toThrow(/a map requires v: 2/)
  })

  it('the map reaches the measurement: the choke-map report differs from the open arena', () => {
    // Contract: the gate matchup over the committed seed set on the choke fixture serializes
    // deterministically and hashes to its own committed golden; its per-run outcomes are not
    // identical to the same matchup on the default arena — the map demonstrably changes results.
    const opts: BalanceOptions = { ...GATE_OPTS, map: map('choke-corridor') }
    const s1 = serializeReport(runBalance(comp('grunt-pack'), comp('archer-pack'), opts))
    const s2 = serializeReport(runBalance(comp('grunt-pack'), comp('archer-pack'), opts))
    expect(s1).toBe(s2)
    goldenCheck('gate8.choke-report.hash', reportHash(s1))
    const onChoke = outcomes(JSON.parse(s1) as ReturnType<typeof runBalance>)
    const onOpen = outcomes(runBalance(comp('grunt-pack'), comp('archer-pack'), GATE_OPTS))
    expect(onChoke).not.toEqual(onOpen)
  })

  it('fairness is measurable: the asymmetric fixture skews a mirror matchup beyond baseline', () => {
    // Contract: run one comp against ITSELF on the committed asymmetric fixture and on the
    // default arena, same seed set. The per-side skew on the asymmetric map exceeds the default
    // arena's — differencing out the known movement-order side bias (issue #4) so the number
    // isolates the map's contribution.
    const mirror = comp('grunt-pack')
    const open = sideSkew(runBalance(mirror, mirror, GATE_OPTS))
    const lopsided = sideSkew(runBalance(mirror, mirror, { ...GATE_OPTS, map: map('lopsided-gate') }))
    expect(open.skew).toBeGreaterThan(0) // the issue-#4 baseline is real and visible
    expect(lopsided.skew).toBeGreaterThan(open.skew) // the map adds measurable unfairness on top
  })

  it('viewer terrain is testable headless: impassable tiles derive draw entries', () => {
    // Contract: a view-model function (like flybysFrom/queuePips) maps state.map impassable
    // tiles to terrain draw entries with projected positions — asserted with no canvas.
    const proj = createProjection()
    const choke = map('choke-corridor')
    const tiles = terrainTiles(choke.map, proj)
    const walls = choke.map.flags.filter((f) => (f & TILE_PASSABLE) === 0).length
    expect(tiles.length).toBe(walls)
    expect(walls).toBeGreaterThan(0)
    for (const t of tiles.slice(0, 8)) {
      expect(choke.map.flags[t.y * choke.map.w + t.x] & TILE_PASSABLE).toBe(0)
      const [sx, sy] = proj.worldToScreen(t.x + 0.5, t.y + 0.5)
      expect(t.sx).toBe(sx)
      expect(t.sy).toBe(sy)
    }
    // the open default map draws no terrain
    expect(terrainTiles(initialState(1).map, proj).length).toBe(0)
  })

  it('the maps-as-data decision record is ratified (not a proposal)', () => {
    const record = readFileSync(resolve('docs/decisions/maps-as-data.md'), 'utf8')
    expect(record, 'flip **Status:** to decided when ratifying').toMatch(/status[^a-z\n]*decided/i)
  })
})
