import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Gate 8 contracts — see docs/build-plan.md Gate 8 and docs/decisions/maps-as-data.md.
// Each expect.fail below is a contract to IMPLEMENT (assertions may only get stronger, never
// looser). The pieces these tests will need land with the implementation:
//   parseMap (pure fixture→WorldMap parser) and the optional map arg to initialState, @rts/sim
//   ReplayFile v2 (explicit version, embedded map) through buildReplayInitial
//   --map support in the balance harness (spawn anchors from the fixture, map name in the report)
//   a terrain view-model function in @rts/render, headless like flybys/pips

describe('Gate 8 — maps & terrain as data', () => {
  it('a map is a data fixture: parse a committed fixture, add a second with no code change', () => {
    // Contract: a committed JSON map fixture ({ name, tiles, spawns }, legend '.'/'#') parses
    // to a WorldMap; a SECOND committed fixture loads and runs through the same path with no
    // sim or harness code change — adding a map is adding a file.
    expect.fail('implement map fixtures + parseMap (docs/decisions/maps-as-data.md)')
  })

  it('terrain has teeth: a unit ordered through a choke wall never enters it', () => {
    // Contract: on the committed choke fixture, order a unit through the impassable band; at
    // every tick the unit occupies only passable tiles, and the scenario end state hashes to a
    // committed golden under tests/gates/golden/gate8.choke.hash.
    expect.fail('implement a choke scenario on a fixture map, pinned by a golden')
  })

  it('the sim default path is untouched: no previously committed golden moves', () => {
    // Contract: re-run the gate 1/3/4 golden scenarios and the gate 7 balance report after maps
    // land; every hash still equals its committed golden. The no-map path is byte-identical —
    // the report only gains a map field when a map is given.
    expect.fail('keep initialState default and the no-map report serialization byte-identical')
  })

  it('replay v2 round-trips: an exported --map run embeds its map and replays to its endHash', () => {
    // Contract: export one run from a --map report; the file carries v: 2 and an embedded
    // map { w, h, flags }; replay(buildReplayInitial(file), file.log) === the row's endHash.
    expect.fail('implement ReplayFile v2 with the map embedded inline')
  })

  it('v1 replays stay valid and unknown versions are refused', () => {
    // Contract: the committed gate4-match.json (no v field) still re-simulates to the committed
    // gate4.match.hash through the same loader; a file with an unknown version, a map without
    // v: 2, or a v: 2 without a map is refused with a loud error, never misread.
    expect.fail('implement explicit replay versioning with loud refusal')
  })

  it('the map reaches the measurement: the choke-map report differs from the open arena', () => {
    // Contract: the gate matchup over the committed seed set on the choke fixture serializes
    // deterministically and hashes to its own committed golden; its per-run outcomes are not
    // identical to the same matchup on the default arena — the map demonstrably changes results.
    expect.fail('implement --map through the balance harness, pinned by its own golden')
  })

  it('fairness is measurable: the asymmetric fixture skews a mirror matchup beyond baseline', () => {
    // Contract: run one comp against ITSELF on the committed asymmetric fixture and on the
    // default arena, same seed set. The per-side skew on the asymmetric map exceeds the default
    // arena's — differencing out the known movement-order side bias (issue #4) so the number
    // isolates the map's contribution.
    expect.fail('implement the mirror-matchup fairness readout against the open-arena baseline')
  })

  it('viewer terrain is testable headless: impassable tiles derive draw entries', () => {
    // Contract: a view-model function (like flybysFrom/queuePips) maps state.map impassable
    // tiles to terrain draw entries with projected positions — asserted with no canvas.
    expect.fail('implement the terrain view-model in @rts/render')
  })

  it('the maps-as-data decision record is ratified (not a proposal)', () => {
    const record = readFileSync(resolve('docs/decisions/maps-as-data.md'), 'utf8')
    expect(record, 'flip **Status:** to decided when ratifying').toMatch(/status[^a-z\n]*decided/i)
  })
})
