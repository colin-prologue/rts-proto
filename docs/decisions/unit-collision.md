# Decision: unit collision — tile exclusivity, id-stable resolution

**Status:** decided (ratified for Gate 9). Revisit only with a replacement record.

## Choice

**One entity per tile, enforced at movement time.** The tile (floor of the fixed-point
position) is the collision unit — it matches the movement quantum (speeds are whole tiles per
tick) and needs no distance math beyond what the sim already has.

- **Occupancy.** Every living entity — unit, building, resource node — occupies its floor tile.
  A move may not end on a tile occupied by another entity.
- **Resolution order is stable id order** (CONSTITUTION IV). Moves are applied one entity at a
  time, lowest id first; a tile vacated earlier in the same tick is free to a later mover — so
  columns follow leaders without gaps, one tile per tick.
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

## Named weak point

Id-order resolution gives earlier ids a *contention* advantage: when two units want the same
tile on the same tick, the lower id gets it. This is accepted deliberately: unlike the aim
asymmetry this gate removes (`docs/decisions/movement-fairness.md`), tile contention is
information-symmetric, bounded to one tile of displacement, and self-correcting (the loser
takes the next-best cell or follows one tick later). The balance harness's orientation pairing
cancels what residue remains from comp comparisons; the open-arena mirror skew in the Gate 9
acceptance is the number that keeps this honest. Two movers meeting head-on in a one-wide
corridor deadlock until one is re-ordered — authentic old-school RTS behavior, accepted at
prototype scale.

## Rejected

- **Soft push / flocking separation:** continuous forces want fractional displacement and
  square roots, fighting the integer determinism laws for a feel benefit the prototype's
  design questions don't need yet.
- **Sub-tile radius collision:** real circle-vs-circle resolution needs distance math and
  iterative separation — heavy machinery when movement is already tile-quantized.
- **Randomized contention tiebreak:** spends seeded RNG draws on non-gameplay and turns a
  legible, testable bias into noise (CONSTITUTION III call-order pollution for no design win).
- **No collision (status quo):** blob-stacking makes engagements degenerate — Gate 7 measured
  mean match length at 19 ticks because armies interpenetrate into a single point of mutual
  annihilation. Collision is what makes formations, concaves, and chokes exist at all.
