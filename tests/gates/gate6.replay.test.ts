import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  initialState,
  spawn,
  step,
  replay,
  hashState,
  fromInt,
  tableDamage,
  buildReplayInitial,
  DEFAULT_DATA,
  type Command,
  type State,
  type SimEvent,
  type ReplayFile,
} from '@rts/sim'
import { flybysFrom, hpFraction, queuePips, interpolatePositions, reconstructToTick } from '@rts/render'

const golden = (file: string) => Number(readFileSync(resolve(`tests/gates/golden/${file}`), 'utf8').trim())

const cmd = (type: Command['type'], playerId: number, seq: number, unitIds: number[], payload?: unknown): Command =>
  ({ type, playerId, seq, unitIds, payload })

// The gate-1 scenario, byte-for-byte (tests/gates/gate1.determinism.test.ts) — with events on.
function runGate1(events?: SimEvent[]): State {
  const move = (seq: number): Command =>
    ({ type: 'MOVE', playerId: 0, seq, unitIds: [1], payload: { x: fromInt(5), y: fromInt(5) } })
  let s = initialState(1234)
  for (const cmds of [[move(0)], [], [move(1)], [], []]) s = step(s, cmds, events)
  return s
}

// The gate-3 economy scenario, byte-for-byte (tests/gates/gate3.rtsloop.test.ts) — with events on.
function runEconomy(events?: SimEvent[]): State {
  let s = initialState(99)
  s = spawn(s, 'depot', 0, fromInt(10), fromInt(10))
  s = spawn(s, 'minerals', -1, fromInt(12), fromInt(10))
  s = spawn(s, 'worker', 0, fromInt(11), fromInt(10))
  const commandsAt: Record<number, Command[]> = {
    0: [cmd('GATHER', 0, 0, [4], { nodeId: 3 }), cmd('TRAIN', 0, 1, [2], { unit: 'grunt' })],
    20: [cmd('TRAIN', 0, 0, [2], { unit: 'archer' })],
  }
  for (let i = 0; i < 60; i++) s = step(s, commandsAt[s.tick] ?? [], events)
  return s
}

// The gate-3 combat scenario, byte-for-byte — with events on. Returns end state + event log.
function runCombat(): { end: State; events: SimEvent[]; initial: State } {
  let s = initialState(7)
  s = spawn(s, 'grunt', 0, fromInt(10), fromInt(10))
  s = spawn(s, 'grunt', 0, fromInt(10), fromInt(11))
  s = spawn(s, 'archer', 1, fromInt(14), fromInt(10))
  s = spawn(s, 'archer', 1, fromInt(14), fromInt(11))
  const initial = s
  const events: SimEvent[] = []
  const commandsAt: Record<number, Command[]> = {
    0: [
      cmd('ATTACK', 0, 0, [2], { targetId: 4 }),
      cmd('ATTACK', 0, 1, [3], { targetId: 5 }),
      cmd('ATTACK', 1, 0, [4], { targetId: 2 }),
      cmd('ATTACK', 1, 1, [5], { targetId: 3 }),
    ],
  }
  for (let i = 0; i < 30; i++) s = step(s, commandsAt[s.tick] ?? [], events)
  return { end: s, events, initial }
}

describe('Gate 6 — replay viewer', () => {
  it('events are pure output: with a sink attached, every committed golden still matches', () => {
    const e1: SimEvent[] = []
    expect(hashState(runGate1(e1)) >>> 0).toBe(golden('gate1.hash'))
    const e3: SimEvent[] = []
    expect(hashState(runEconomy(e3)) >>> 0).toBe(golden('gate3.economy.hash'))
    expect(hashState(runCombat().end) >>> 0).toBe(golden('gate3.combat.hash'))
    // and the sinks actually collected something — this is not a no-op pass
    expect(e3.length).toBeGreaterThan(0)
  })

  it('two identical runs emit identical event logs', () => {
    const a = runCombat().events
    const b = runCombat().events
    expect(a.length).toBeGreaterThan(0)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('DAMAGE events carry attribution matching the damage-table math', () => {
    const { events, initial } = runCombat()
    const specOf = new Map(initial.entities.map((e) => [e.id, DEFAULT_DATA.units[e.type]]))
    const damage = events.filter((e) => e.kind === 'DAMAGE')
    expect(damage.length).toBeGreaterThan(0)
    for (const d of damage) {
      const attacker = specOf.get(d.attacker)!
      const target = specOf.get(d.target)!
      expect(attacker, `attacker ${d.attacker} unknown`).toBeDefined()
      expect(target, `target ${d.target} unknown`).toBeDefined()
      expect(d.amount).toBe(tableDamage(DEFAULT_DATA, attacker.damageType, target.armor, attacker.damage))
    }
  })

  it('a recorded replay file re-simulates to the committed gate4.match.hash', () => {
    const file = JSON.parse(
      readFileSync(resolve('apps/playground/public/replays/gate4-match.json'), 'utf8')
    ) as ReplayFile
    expect(file.log.length).toBeGreaterThan(0)
    const end = replay(buildReplayInitial(file), file.log)
    expect(hashState(end) >>> 0).toBe(golden('gate4.match.hash'))
  })

  it('view-model helpers are testable without a canvas', () => {
    // flybys anchor DAMAGE events at the target's interpolated position
    const { initial } = runCombat()
    const positions = interpolatePositions(initial, initial, 0)
    const events: SimEvent[] = [
      { kind: 'DAMAGE', attacker: 4, target: 2, amount: 12 },
      { kind: 'DAMAGE', attacker: 2, target: 999, amount: 5 }, // no such target — dropped
      { kind: 'SPAWN', id: 9, type: 'grunt', owner: 0 }, // not a DAMAGE — ignored
    ]
    const flybys = flybysFrom(events, positions)
    expect(flybys.length).toBe(1)
    expect(flybys[0]).toMatchObject({ target: 2, amount: 12, x: 10, y: 10, ttl: 1 })

    // hp fractions clamp
    expect(hpFraction(50, 100)).toBe(0.5)
    expect(hpFraction(-20, 100)).toBe(0)
    expect(hpFraction(150, 100)).toBe(1)
    expect(hpFraction(10, 0)).toBe(0)

    // queue pips expose count + head progress
    expect(queuePips(undefined, DEFAULT_DATA.units)).toEqual({ count: 0, headProgress: 0 })
    const pips = queuePips(
      [{ unit: 'grunt', remaining: 5 }, { unit: 'archer', remaining: 12 }],
      DEFAULT_DATA.units
    )
    expect(pips.count).toBe(2)
    expect(pips.headProgress).toBeCloseTo(0.5, 10) // grunt buildTime 10, 5 remaining
  })

  it('the sim-events decision record is ratified (not a proposal)', () => {
    const record = readFileSync(resolve('docs/decisions/sim-events.md'), 'utf8')
    expect(record, 'flip **Status:** to decided when ratifying').toMatch(/status[^a-z\n]*decided/i)
  })
})

// #14 — step-back is deterministic reconstruction; determinism makes it exact, these pin it.
describe('Gate 6 addendum — step-back reconstruction (#14)', () => {
  const file = JSON.parse(
    readFileSync(resolve('apps/playground/public/replays/gate4-match.json'), 'utf8')
  ) as ReplayFile

  it('reconstruct-to-tick(N) hash-equals forward-play-to-N for several N', () => {
    // Forward play exactly the way the viewer advances: one step per log entry.
    let s = buildReplayInitial(file)
    const forwardHash: number[] = [hashState(s)]
    for (let t = 0; t < file.log.length; t++) {
      s = step(s, file.log[t] ?? [])
      forwardHash.push(hashState(s))
    }
    const L = file.log.length
    expect(L).toBeGreaterThan(2)
    for (const n of [0, 1, 2, Math.floor(L / 3), Math.floor(L / 2), L - 1, L]) {
      expect(
        hashState(reconstructToTick(file, n, buildReplayInitial, step)),
        `reconstruction diverged at tick ${n}`
      ).toBe(forwardHash[n])
    }
  })

  it('reconstruct-to-tick clamps n to the log range', () => {
    const initialHash = hashState(buildReplayInitial(file))
    const endHash = hashState(replay(buildReplayInitial(file), file.log))
    expect(hashState(reconstructToTick(file, -3, buildReplayInitial, step))).toBe(initialHash)
    expect(hashState(reconstructToTick(file, file.log.length + 100, buildReplayInitial, step))).toBe(endHash)
  })
})
