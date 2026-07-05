import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Gate 9 contracts — see docs/build-plan.md Gate 9, docs/decisions/movement-fairness.md, and
// docs/decisions/unit-collision.md. Each expect.fail below is a contract to IMPLEMENT
// (assertions may only get stronger, never looser). The pieces these tests will need land with
// the implementation:
//   the flow-field pathfinder behind the interface promised in docs/decisions/pathfinding.md
//   step() phase 4 rewritten: snapshot intents (issue #4 fix) + tile-exclusive collision
//   the one-commit golden migration (every committed golden moves; re-recorded deliberately)

describe('Gate 9 — movement & collision', () => {
  it('fairness mechanism: mirrored duels are symmetric, melee and ranged (issue #4)', () => {
    // Contract: two identical units, mirrored positions, mutual ATTACK on tick 0 — per-tick hp
    // trajectories are identical for both sides until the duel resolves, for a melee (grunt)
    // and a ranged (archer) pair; each end state hashes to a committed golden
    // (gate9.duel-melee.hash, gate9.duel-ranged.hash). Pre-fix, the higher id reads its
    // opponent's already-updated position and wins the information race.
    expect.fail('implement snapshot-intent movement (docs/decisions/movement-fairness.md)')
  })

  it('fairness at population: the open-arena mirror skew collapses below the pre-fix baseline', () => {
    // Contract: grunt-pack vs ITSELF on the default arena over the gate seed set (baseSeed
    // 20260704, seedCount 64) — sideSkew(...).skew is strictly below 32, the pre-fix baseline
    // measured at planning time on main @ 1569eed (slot0 18 / slot1 50). Gate 8's live contract
    // (lopsided-gate skew exceeds the open-arena skew) keeps holding on the re-derived numbers.
    expect.fail('the movement-order fairness fix must shrink the mirror-matchup side skew')
  })

  it('collision has teeth: a converge order packs around the point, one entity per tile', () => {
    // Contract: a squad spawned on distinct tiles and ordered to one point — after every tick,
    // no two entities share a floor tile; the squad packs around the destination and comes to
    // rest via arrival relaxation (no perpetual grinding); end state hashes to a committed
    // golden (gate9.converge.hash).
    expect.fail('implement tile-exclusive collision (docs/decisions/unit-collision.md)')
  })

  it('no walking through units: a stationary blocker is routed around, never overlapped', () => {
    // Contract: a unit ordered to a destination with a stationary blocker directly on the
    // straight-line path never shares the blocker’s tile at any tick and still arrives at the
    // destination tile; end state hashes to a committed golden (gate9.blocker.hash).
    expect.fail('movement must never create a co-occupied tile')
  })

  it('flow fields route: the gate-8 choke order now arrives through the gap', () => {
    // Contract: on the committed choke-corridor fixture, the gate-8 scenario’s order (unit at
    // (5,8) sent to (26,8), straight line through the wall band) ARRIVES at its destination
    // tile within a committed budget (≤ 60 ticks), occupying only passable tiles at every
    // tick; end state hashes to a committed golden (gate9.choke-route.hash). This supersedes
    // gate 8’s stopped-at-the-wall assertion, per the build-plan’s declared supersession.
    expect.fail('implement the flow-field pathfinder (docs/decisions/pathfinding.md)')
  })

  it('armies move: 40 grunts cross the choke, ≥90% arrive, never stacked', () => {
    // Contract: 40 grunts on the choke-corridor fixture ordered to the far side; at least 90%
    // reach the far side of the wall within a committed budget (≤ 300 ticks); after every
    // tick’s movement no two entities share a tile; end state hashes to a committed golden
    // (gate9.army.hash). The charter’s 40-unit-army question, made mechanical.
    expect.fail('group movement through a choke: flow field + collision working together')
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
