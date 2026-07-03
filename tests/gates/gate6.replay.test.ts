import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Gate 6 contracts — see docs/build-plan.md Gate 6 and docs/decisions/sim-events.md.
// Each expect.fail below is a contract to IMPLEMENT (assertions may only get stronger, never
// looser). The imports these tests will need land with the implementation:
//   { step, initialState, spawn, hashState, type SimEvent } from '@rts/sim'
//   { loadReplay, recordReplay } from apps/headless recorder
//   { flybiesFrom, hpFraction, queuePips } from '@rts/render' (view-model helpers, canvas-free)

describe('Gate 6 — replay viewer', () => {
  it('events are pure output: with a sink attached, every committed golden still matches', () => {
    // Contract: re-run the gate 1/3/4 golden scenarios passing an event sink to step();
    // assert each end-state hash still equals its committed golden file. No hash may move.
    expect.fail('implement the event sink (docs/decisions/sim-events.md) without moving any golden')
  })

  it('two identical runs emit identical event logs', () => {
    // Contract: run the gate-3 combat scenario twice with sinks; serialize both event logs;
    // assert byte-identical. Event order is part of the determinism contract.
    expect.fail('implement deterministic event emission')
  })

  it('DAMAGE events carry attribution matching the damage-table math', () => {
    // Contract: in the combat scenario, every DAMAGE event has attacker id, target id, and
    // amount === tableDamage(data, attacker.damageType, target.armor, attacker.damage).
    expect.fail('implement attributed DAMAGE events')
  })

  it('a recorded replay file re-simulates to the committed gate4.match.hash', () => {
    // Contract: the checked-in replay fixture (written by `npm run replay:record gate4`)
    // reconstructs the match world from { seed, setup } and folds { log } via replay();
    // end-state hash === Number(readFileSync('tests/gates/golden/gate4.match.hash')).
    expect.fail('implement the replay file format + headless recorder CLI')
  })

  it('view-model helpers are testable without a canvas', () => {
    // Contract: flyby entries derived from DAMAGE events (world position + ttl), hp fractions
    // clamped to [0,1], queue pips {count, headProgress} from a building entity. Pure functions
    // in @rts/render, unit-tested here.
    expect.fail('implement canvas-free view-model helpers for flybys, hp bars, queue pips')
  })

  it('the sim-events decision record is ratified (not a proposal)', () => {
    const record = readFileSync(resolve('docs/decisions/sim-events.md'), 'utf8')
    expect(record, 'flip **Status:** to decided when ratifying').toMatch(/status[^a-z\n]*decided/i)
  })
})
