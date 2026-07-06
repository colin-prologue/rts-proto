# Decision: unit collision — tile exclusivity, id-stable resolution

**Status:** decided (ratified for Gate 9). Revisit only with a replacement record.

## Choice

**One entity per tile, enforced at movement time.** The tile (floor of the fixed-point
position) is the collision unit — it matches the movement quantum (speeds are whole tiles per
tick) and needs no distance math beyond what the sim already has.

- **Occupancy.** Every living entity — unit, building, resource node — occupies its floor tile.
  A move may not end on a tile occupied by another entity.
- **Resolution order is stable id order; its direction is drawn per tick from the seeded RNG**
  (amended during implementation — see the named weak point below for the measurements that
  forced it). Moves are applied one entity at a time in id order, ascending or descending as
  one `state.rng` draw at a fixed point in the phase decides (CONSTITUTION III: the draw order
  is part of the contract; CONSTITUTION IV: the iteration itself stays id-stable and identical
  on every peer). A tile vacated earlier in the same tick is free to a later mover — so columns
  follow leaders without gaps, one tile per tick.
- **Alternates, monotone on the flow field.** A blocked mover may take the best *strictly
  cost-decreasing* free neighbor instead (candidates ordered by field cost, then fixed neighbor
  order). Strictly-decreasing-only means movement always makes progress toward the destination
  and can never oscillate; if nothing strictly better is free, the unit waits in place.
- **Arrival relaxation.** A mover blocked only by *stationary* entities (no movement intent
  this tick — an idle unit, a building, a node) on every strictly-better neighbor treats the
  order as complete and clears its move target. This is what lets a group ordered to one point
  pack around it and stop, ring by ring, instead of grinding forever. A mover blocked by other
  *movers* keeps waiting — that is a queue at a choke, not an arrival.
- **Spawn overlaps stay legal.** Production drops units at the building's exit tile and setup
  jitter may stack spawns; collision constrains *movement*, so movement never creates a new
  co-occupancy and existing stacks dissolve as units move off. Unblocking spawn placement is
  future work for the production side, not this record.
- **Pathfinding does not see units.** Flow fields cost terrain only
  (`docs/decisions/pathfinding.md`); congestion is resolved locally by the rules above. A
  dynamic-cost field that re-plans around crowds is more machinery than the prototype's design
  questions need.

## Named weak point (and the amendment it forced)

Order-based resolution gives whoever applies first a *contention* advantage: when two units
want the same tile on the same tick, the first-processed gets it. As ratified at planning this
record accepted plain ascending-id order, predicting the residue would be small. Measurement
said otherwise: at 500 seeds (1000 runs) of the open-arena mirror matchup, pure ascending
order skewed decided wins 584/388 toward slot 0 (z ≈ 6) — a bias as large as the issue-#4 aim
asymmetry it sat next to. A deterministic alternation (by tick parity) measured clean at large
N (skew 38, within noise) but is phase-locked to match start: first contact lands on a
geometry-determined parity, so on a fixed seed set the residue does not reliably cancel.
Hence the amendment above: the per-tick *direction* of the id-stable order comes from one
seeded-RNG draw — unbiased and uncorrelated with contact geometry by construction (measured:
open-arena mirror skew 0 on the gate seed set, 78 ≈ noise at 500 seeds; grunt-vs-archer
per-orientation split symmetric).

What remains accepted: contention itself is information-symmetric (all intents read the same
snapshot — `docs/decisions/movement-fairness.md`), bounded to one tile of displacement, and
self-correcting (the loser takes the next-best cell or follows one tick later). The open-arena
mirror skew in the Gate 9 acceptance is the number that keeps it honest. Two movers meeting
head-on in a one-wide corridor deadlock until one is re-ordered — authentic old-school RTS
behavior, accepted at prototype scale.

## Rejected

- **Soft push / flocking separation:** continuous forces want fractional displacement and
  square roots, fighting the integer determinism laws for a feel benefit the prototype's
  design questions don't need yet.
- **Sub-tile radius collision:** real circle-vs-circle resolution needs distance math and
  iterative separation — heavy machinery when movement is already tile-quantized.
- **Per-conflict randomized tiebreak:** one RNG draw per contested tile spends the seeded
  stream on every shove and turns each local outcome into noise. The amended per-*tick*
  direction draw keeps the stream cost to one draw a tick and leaves every individual contest
  legible (the tick's direction decides it), while still killing the systematic bias the
  measurements above exposed.
- **Fixed deterministic alternation (tick parity):** measured clean at large N but phase-locks
  the advantage to match-start geometry — rejected for the reasons in the named-weak-point
  section.
- **No collision (status quo):** blob-stacking makes engagements degenerate — Gate 7 measured
  mean match length at 19 ticks because armies interpenetrate into a single point of mutual
  annihilation. Collision is what makes formations, concaves, and chokes exist at all.
