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
  buildReplayInitial,
  DEFAULT_DATA,
  type Command,
  type State,
  type GameData,
  type ReplayFile,
} from '@rts/sim'
import {
  loadComp,
  runBalance,
  exportRun,
  serializeReport,
  reportHash,
  type BalanceOptions,
} from '../../apps/headless/src/balance'

// Gate 7 contracts — see docs/build-plan.md Gate 7 and docs/decisions/balance-sampling.md.
// The gate matchup and seed set are fixed here; the report hash is pinned by a committed golden.

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
const GATE_OPTS: BalanceOptions = { baseSeed: 20260704, seedCount: 64 }
// The designated close matchup: contested from both sides across the committed seed set.
const gateReport = () => runBalance(comp('grunt-pack'), comp('archer-pack'), GATE_OPTS)

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

const favored = (r: ReturnType<typeof runBalance>) =>
  r.aggregate.winsA > r.aggregate.winsB ? 'A' : r.aggregate.winsB > r.aggregate.winsA ? 'B' : 'tie'

describe('Gate 7 — headless balance harness', () => {
  it('the balance report is deterministic and matches its committed golden', () => {
    // Contract: run the gate matchup over the committed seed set twice; serialize both reports;
    // assert byte-identical, and hash === golden under tests/gates/golden/gate7.balance.hash.
    const s1 = serializeReport(gateReport())
    const s2 = serializeReport(gateReport())
    expect(s1).toBe(s2)
    goldenCheck('gate7.balance.hash', reportHash(s1))
  })

  it('variance lives in setup, not in step(): no previously committed golden moves', () => {
    // Contract: re-run the gate 1/3/4 golden scenarios after the harness lands; every end-state
    // hash still equals its committed golden file. packages/sim behavior is untouched.
    expect(hashState(runGate1()) >>> 0).toBe(golden('gate1.hash'))
    expect(hashState(runEconomy()) >>> 0).toBe(golden('gate3.economy.hash'))
    expect(hashState(runCombat()) >>> 0).toBe(golden('gate3.combat.hash'))
    const file = JSON.parse(
      readFileSync(resolve('apps/playground/public/replays/gate4-match.json'), 'utf8')
    ) as ReplayFile
    expect(hashState(replay(buildReplayInitial(file), file.log)) >>> 0).toBe(golden('gate4.match.hash'))
  })

  it('seeds have teeth: the close matchup is not a monoculture', () => {
    // Contract: across the committed seed set (both orientations), the designated close matchup
    // yields at least one win for EACH comp, and the per-run (winner, ticks) outcomes are not
    // all identical — the jitter demonstrably reaches match outcomes.
    const r = gateReport()
    expect(r.aggregate.winsA).toBeGreaterThanOrEqual(1)
    expect(r.aggregate.winsB).toBeGreaterThanOrEqual(1)
    const outcomes = new Set(r.runs.map((row) => `${row.winner}:${row.ticks}`))
    expect(outcomes.size).toBeGreaterThan(1)
    // the report's own lumpiness guard agrees the sample is not a monoculture
    expect(r.aggregate.distinctOutcomes).toBeGreaterThan(1)
  })

  it('one damage-table cell flips the favored comp (aggregate data-flip)', () => {
    // Contract: with a single overridden damageTable cell, the report favors the other comp —
    // gate 3's live-tunability proof, at population level.
    const before = favored(gateReport())
    const boosted: GameData = {
      ...DEFAULT_DATA,
      damageTable: {
        ...DEFAULT_DATA.damageTable,
        pierce: { ...DEFAULT_DATA.damageTable.pierce, light: 300 },
      },
    }
    const after = favored(runBalance(comp('grunt-pack'), comp('archer-pack'), { ...GATE_OPTS, data: boosted }))
    expect(before).not.toBe('tie')
    expect(after).not.toBe('tie')
    expect(after).not.toBe(before)
  })

  it('a comp is a data fixture: new comp file, no code change', () => {
    // Contract: load a comp from a JSON fixture (as tests/gates/fixtures/zealot.json does for
    // units) and the harness reports on it without touching sim or harness code.
    const mixed = comp('mixed-squad')
    expect(mixed.units.length).toBeGreaterThan(1)
    const r = runBalance(mixed, comp('archer-pack'), { baseSeed: 7, seedCount: 8 })
    expect(r.runs.length).toBe(16)
    expect(r.aggregate.winsA + r.aggregate.winsB + r.aggregate.draws).toBe(16)
    for (const row of r.runs) expect(['A', 'B', 'draw']).toContain(row.winner)
  })

  it('every statistic is watchable: an exported run replays to its reported endHash', () => {
    // Contract: export one run from the report as a Gate 6 ReplayFile; re-simulate it; the
    // end-state hash === the endHash recorded in that run's report row. One run per winner,
    // so both orientations of the export path are exercised.
    const r = gateReport()
    for (const target of ['A', 'B'] as const) {
      const row = r.runs.find((x) => x.winner === target)!
      expect(row).toBeDefined()
      const file = exportRun(comp('grunt-pack'), comp('archer-pack'), GATE_OPTS, row.run)
      expect(file.log.length).toBe(row.ticks)
      const end = replay(buildReplayInitial(file), file.log)
      expect(hashState(end) >>> 0).toBe(row.endHash)
    }
  })

  it('the balance-sampling decision record is ratified (not a proposal)', () => {
    const record = readFileSync(resolve('docs/decisions/balance-sampling.md'), 'utf8')
    expect(record, 'flip **Status:** to decided when ratifying').toMatch(/status[^a-z\n]*decided/i)
  })
})
