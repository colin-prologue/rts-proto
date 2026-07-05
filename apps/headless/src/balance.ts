// Headless balance harness (Gate 7). Sampling model per docs/decisions/balance-sampling.md:
// a run is (matchup, seed, orientation); variance enters ONLY as bounded seeded spawn jitter at
// scenario construction here in the harness; each seed plays both orientations so first-actor
// bias cancels out of the comp comparison; step() and every committed golden stay untouched.
//
// Everything below is pure integer math over the sim's own primitives (seedRng/rngInt for the
// jitter stream, hashState/hashStr for hashes) — no Math.random, no wall clock, so the same
// (matchup, baseSeed, seedCount) always yields the byte-identical report.
import { readFileSync } from 'node:fs'
import {
  initialState,
  spawn,
  step,
  hashState,
  hashInit,
  hashStr,
  fromInt,
  raw,
  seedRng,
  rngInt,
  rngU32,
  DEFAULT_DATA,
  type GameData,
  type State,
  type Command,
  type ReplayFile,
  type ReplaySetupRow,
  type Rng,
} from '@rts/sim'

export interface Comp {
  name: string
  units: { type: string; count: number }[]
}

// Comp names flow into report matchup labels and exported replay filenames — keep them to a
// safe token so a fixture can never smuggle path separators into a write path.
const COMP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** A comp is a data fixture — adding one is adding a JSON file, never code. */
export function loadComp(path: string): Comp {
  const comp = JSON.parse(readFileSync(path, 'utf8')) as Comp
  if (!comp.name || !Array.isArray(comp.units) || comp.units.length === 0) {
    throw new Error(`${path}: a comp fixture needs { name, units: [{ type, count }] }`)
  }
  if (!COMP_NAME.test(comp.name)) {
    throw new Error(`${path}: comp name "${comp.name}" must match ${COMP_NAME} (it becomes a filename)`)
  }
  return comp
}

export interface BalanceOptions {
  baseSeed: number
  seedCount: number // each seed plays both orientations: total runs = 2 × seedCount
  data?: GameData // damage-table/unit overrides for tuning experiments
  maxTicks?: number // cap after which an unresolved match is a draw
}

export interface RunRow {
  run: number // index into runs[] — also the exportRun / --replay handle
  seed: number
  orientation: 0 | 1 // 0: comp A is player 0 (left); 1: comp A is player 1 (right)
  winner: 'A' | 'B' | 'draw'
  ticks: number
  endHash: number
}

export interface BalanceReport {
  matchup: { compA: string; compB: string }
  baseSeed: number
  seedCount: number
  runs: RunRow[]
  aggregate: {
    runs: number
    winsA: number
    winsB: number
    draws: number
    winRateA_permille: number
    perOrientation: { winsA: number; winsB: number; draws: number }[]
    meanTicks: number
    // Lumpy-distribution guard (balance-sampling record): a smooth-looking rate resting on only
    // a few distinct end states is visible here instead of hiding inside the aggregate.
    distinctOutcomes: number
  }
}

/** Run seed i derives from the base seed by a pure integer mix — committed, reproducible. */
export function runSeed(baseSeed: number, i: number): number {
  const [v] = rngU32(((baseSeed >>> 0) ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0)
  return v
}

// Symmetric arena on the default 32×32 map: player 0 musters left, player 1 right, mirrored
// about the center column. Formation fills a 5-high column block growing away from the enemy.
const ANCHORS = [
  { x: 8, dir: -1 },
  { x: 23, dir: 1 },
] as const
const ANCHOR_Y = 16
const JITTER = 2 // max spawn offset per axis, in tiles
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Setup rows for one run. Jitter is drawn from the sim's own PRNG seeded by the run seed —
 * per slot, in fixed order (player 0's units first) — so the same seed always builds the same
 * arena. Swapping orientation swaps which comp occupies which slot; the jitter stream is
 * per-slot, so the paired runs share their geometry envelope.
 */
export function makeSetup(compA: Comp, compB: Comp, seed: number, orientation: 0 | 1): ReplaySetupRow[] {
  const bySlot: [Comp, Comp] = orientation === 0 ? [compA, compB] : [compB, compA]
  let rng: Rng = seedRng(seed)
  const rows: ReplaySetupRow[] = []
  for (let owner = 0; owner <= 1; owner++) {
    const anchor = ANCHORS[owner]
    let slot = 0
    for (const u of bySlot[owner].units) {
      for (let k = 0; k < u.count; k++) {
        const col = Math.floor(slot / 5)
        const row = (slot % 5) - 2
        let dx: number, dy: number
        ;[dx, rng] = rngInt(rng, 2 * JITTER + 1)
        ;[dy, rng] = rngInt(rng, 2 * JITTER + 1)
        rows.push({
          type: u.type,
          owner,
          x: clamp(anchor.x + anchor.dir * col + (dx - JITTER), 2, 29),
          y: clamp(ANCHOR_Y + row + (dy - JITTER), 2, 29),
        })
        slot++
      }
    }
  }
  return rows
}

// Mirrors buildReplayInitial (packages/sim/src/replay-file.ts) with a data override for tuning
// experiments. For default data the gate's round-trip contract pins the two paths together: an
// exported run must re-simulate to the same endHash through buildReplayInitial itself.
function buildInitial(seed: number, setup: ReplaySetupRow[], data: GameData): State {
  let s = initialState(seed, data)
  for (const row of setup) s = spawn(s, row.type, row.owner, fromInt(row.x), fromInt(row.y))
  return s
}

/**
 * The fixed engagement policy — identical for every sample, so the harness measures comps, not
 * bots: any idle comp unit that can attack is ordered at the nearest living enemy comp unit
 * (Chebyshev distance, lowest id on ties). ATTACK auto-approaches inside step(); when a target
 * dies the sim clears attackTarget and the unit is re-ordered here next tick. The player-0
 * scout that initialState always includes is a bystander: never ordered, never targeted, and
 * excluded from the terminal condition, which tracks comp units only.
 */
function decide(s: State, sideIds: [Set<number>, Set<number>], data: GameData): Command[] {
  const cmds: Command[] = []
  for (let owner = 0; owner <= 1; owner++) {
    const enemies = s.entities.filter((e) => sideIds[1 - owner].has(e.id))
    if (enemies.length === 0) continue
    let seq = 0
    for (const e of s.entities) {
      if (!sideIds[owner].has(e.id)) continue
      if ((data.units[e.type]?.damage ?? 0) <= 0) continue
      if (e.attackTarget !== undefined) continue
      let best = enemies[0]
      let bestD = Number.MAX_SAFE_INTEGER
      for (const t of enemies) {
        const d = Math.max(Math.abs(raw(e.x) - raw(t.x)), Math.abs(raw(e.y) - raw(t.y)))
        if (d < bestD) {
          bestD = d
          best = t
        }
      }
      cmds.push({ type: 'ATTACK', playerId: owner, seq: seq++, unitIds: [e.id], payload: { targetId: best.id } })
    }
  }
  return cmds
}

const DEFAULT_MAX_TICKS = 300
const FIRST_SETUP_ID = 2 // initialState owns id 1 (the scout); setup rows take 2..N+1 in order

interface MatchResult {
  winnerSlot: 0 | 1 | -1 // player slot, -1 = draw (tick cap or mutual annihilation)
  ticks: number
  endHash: number
  log: Command[][]
}

function runMatch(seed: number, setup: ReplaySetupRow[], slot0Count: number, data: GameData, maxTicks: number): MatchResult {
  const sideIds: [Set<number>, Set<number>] = [new Set(), new Set()]
  setup.forEach((_, i) => sideIds[i < slot0Count ? 0 : 1].add(FIRST_SETUP_ID + i))
  let s = buildInitial(seed, setup, data)
  const log: Command[][] = []
  const anyAlive = (side: 0 | 1) => s.entities.some((e) => sideIds[side].has(e.id))
  while (s.tick < maxTicks && anyAlive(0) && anyAlive(1)) {
    const cmds = decide(s, sideIds, data)
    log.push(cmds)
    s = step(s, cmds)
  }
  const alive0 = anyAlive(0)
  const alive1 = anyAlive(1)
  const winnerSlot = alive0 && !alive1 ? 0 : alive1 && !alive0 ? 1 : -1
  return { winnerSlot, ticks: s.tick, endHash: hashState(s) >>> 0, log }
}

const unitCount = (c: Comp) => c.units.reduce((n, u) => n + u.count, 0)

export function runBalance(compA: Comp, compB: Comp, opts: BalanceOptions): BalanceReport {
  const data = opts.data ?? DEFAULT_DATA
  const maxTicks = opts.maxTicks ?? DEFAULT_MAX_TICKS
  const runs: RunRow[] = []
  const perOrientation = [
    { winsA: 0, winsB: 0, draws: 0 },
    { winsA: 0, winsB: 0, draws: 0 },
  ]
  let tickSum = 0
  for (let i = 0; i < opts.seedCount; i++) {
    const seed = runSeed(opts.baseSeed, i)
    for (const orientation of [0, 1] as const) {
      const setup = makeSetup(compA, compB, seed, orientation)
      const slot0Count = unitCount(orientation === 0 ? compA : compB)
      const m = runMatch(seed, setup, slot0Count, data, maxTicks)
      const winner: RunRow['winner'] =
        m.winnerSlot === -1 ? 'draw' : (m.winnerSlot === 0) === (orientation === 0) ? 'A' : 'B'
      runs.push({ run: runs.length, seed, orientation, winner, ticks: m.ticks, endHash: m.endHash })
      const o = perOrientation[orientation]
      if (winner === 'A') o.winsA++
      else if (winner === 'B') o.winsB++
      else o.draws++
      tickSum += m.ticks
    }
  }
  const winsA = perOrientation[0].winsA + perOrientation[1].winsA
  const winsB = perOrientation[0].winsB + perOrientation[1].winsB
  const draws = perOrientation[0].draws + perOrientation[1].draws
  const total = runs.length
  return {
    matchup: { compA: compA.name, compB: compB.name },
    baseSeed: opts.baseSeed,
    seedCount: opts.seedCount,
    runs,
    aggregate: {
      runs: total,
      winsA,
      winsB,
      draws,
      winRateA_permille: Math.round((1000 * winsA) / total),
      perOrientation,
      meanTicks: Math.round(tickSum / total),
      distinctOutcomes: new Set(runs.map((r) => r.endHash)).size,
    },
  }
}

/** Canonical serialization — field order is fixed by construction, values are all integers. */
export const serializeReport = (r: BalanceReport): string => JSON.stringify(r)

/** Hash of the serialized report — the Gate 7 golden anchor. */
export const reportHash = (serialized: string): number => hashStr(hashInit(), serialized) >>> 0

/**
 * Re-derive one run as a Gate 6 replay file: same seed, same setup, same logged commands, so
 * `replay(buildReplayInitial(file), file.log)` lands on the endHash its report row recorded —
 * every statistic in the report is watchable in the viewer.
 *
 * Refuses data-overridden runs: the replay format carries no data table, so the viewer would
 * reconstruct the fight under DEFAULT_DATA and diverge from the report row. The watchable
 * tuning loop is edit-the-data-source → re-run → re-watch; `opts.data` is for in-memory
 * experiments (like the gate's flip check), which are not exportable by design.
 */
export function exportRun(compA: Comp, compB: Comp, opts: BalanceOptions, run: number): ReplayFile {
  if (opts.data !== undefined && opts.data !== DEFAULT_DATA) {
    throw new Error(
      'exportRun: replays cannot carry a data override (buildReplayInitial loads DEFAULT_DATA); ' +
        'edit the data source instead to make a tuning run watchable'
    )
  }
  const seed = runSeed(opts.baseSeed, Math.floor(run / 2))
  const orientation = (run % 2) as 0 | 1
  const setup = makeSetup(compA, compB, seed, orientation)
  const slot0Count = unitCount(orientation === 0 ? compA : compB)
  const m = runMatch(seed, setup, slot0Count, DEFAULT_DATA, opts.maxTicks ?? DEFAULT_MAX_TICKS)
  return { name: `${compA.name}-vs-${compB.name}-run${run}`, seed, setup, log: m.log }
}
