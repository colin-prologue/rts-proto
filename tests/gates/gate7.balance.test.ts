import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Gate 7 contracts — see docs/build-plan.md Gate 7 and docs/decisions/balance-sampling.md.
// Each expect.fail below is a contract to IMPLEMENT (assertions may only get stronger, never
// looser). The imports these tests will need land with the implementation:
//   a balance runner from apps/headless — (matchup, seed set) -> serialized report
//   { buildReplayInitial, step, hashState } from '@rts/sim' for the round-trip check

describe('Gate 7 — headless balance harness', () => {
  it('the balance report is deterministic and matches its committed golden', () => {
    // Contract: run the gate matchup over the committed seed set twice; serialize both reports;
    // assert byte-identical, and hash === golden under tests/gates/golden/gate7.balance.hash.
    expect.fail('implement the balance report (docs/decisions/balance-sampling.md)')
  })

  it('variance lives in setup, not in step(): no previously committed golden moves', () => {
    // Contract: re-run the gate 1/3/4 golden scenarios after the harness lands; every end-state
    // hash still equals its committed golden file. packages/sim behavior is untouched.
    expect.fail('keep the sim untouched — seeded jitter is applied at scenario construction only')
  })

  it('seeds have teeth: the close matchup is not a monoculture', () => {
    // Contract: across the committed seed set (both orientations), the designated close matchup
    // yields at least one win for EACH comp, and the per-run (winner, ticks) outcomes are not
    // all identical — the jitter demonstrably reaches match outcomes.
    expect.fail('implement seeded setup jitter that actually changes outcomes')
  })

  it('one damage-table cell flips the favored comp (aggregate data-flip)', () => {
    // Contract: with a single overridden damageTable cell, the report favors the other comp —
    // gate 3's live-tunability proof, at population level.
    expect.fail('implement data-override runs through the harness')
  })

  it('a comp is a data fixture: new comp file, no code change', () => {
    // Contract: load a comp from a JSON fixture (as tests/gates/fixtures/zealot.json does for
    // units) and the harness reports on it without touching sim or harness code.
    expect.fail('implement comp fixtures as data')
  })

  it('every statistic is watchable: an exported run replays to its reported endHash', () => {
    // Contract: export one run from the report as a Gate 6 ReplayFile; re-simulate it; the
    // end-state hash === the endHash recorded in that run's report row.
    expect.fail('implement per-run replay export through the Gate 6 replay path')
  })

  it('the balance-sampling decision record is ratified (not a proposal)', () => {
    const record = readFileSync(resolve('docs/decisions/balance-sampling.md'), 'utf8')
    expect(record, 'flip **Status:** to decided when ratifying').toMatch(/status[^a-z\n]*decided/i)
  })
})
