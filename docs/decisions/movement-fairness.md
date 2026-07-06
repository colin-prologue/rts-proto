# Decision: movement fairness — intents from a pre-movement snapshot

**Status:** decided (ratified for Gate 9; resolves issue #4). Revisit only with a replacement record.

## The finding

Gate 7's balance harness measured a large, systematic second-actor advantage: at 1000 runs of
grunt-pack vs archer-pack, grunts won 57.0% as player 0 but 83.8% as player 1 (issue #4). The
mechanism, verified against `step()` phase 4: movement runs sequentially in id order and an
attacker's approach target is read from the *live* entity map, so units later in id order aim at
positions their targets already updated this tick. Player 1's units always carry higher ids
(spawn order), so they perpetually lead their targets by one tick of information. Combat
(phase 5) is simultaneous; movement was not.

At the Gate 9 planning baseline (main @ 1569eed, gate seed set 20260704 × 64 seeds), the
readout is: open-arena mirror matchup (grunt-pack vs itself) side skew **32** (slot0 18 wins,
slot1 50); grunt-vs-archer per-orientation split 37–27 vs 55–9.

## Choice

**Phase 4 computes every unit's targeting and movement intent from a snapshot of positions taken
at the start of the phase, then applies the moves.** Two passes, both in stable id order:

1. **Intent pass.** Attack-approach destinations are the target's *snapshot* position; each
   mobile unit's desired step (via the pathfinder) is computed against the snapshot. No entity
   observes any same-tick movement.
2. **Application pass.** Desired moves are applied under the collision rules
   (`docs/decisions/unit-collision.md`).

Every unit acts on the same information — the world as it stood when the tick's movement began.
The information asymmetry is gone by construction, not compensated for. No new state field is
needed: the snapshot is derived inside one `step()` call and discarded.

What id order still decides is *contention* (who wins a contested tile — see the collision
record), which is positional, bounded to one tile, and visible; it is not an information
advantage, and the harness's orientation pairing cancels it out of comp comparisons.

## Consequences

`step()` changes, so **every committed golden moves**. The re-record is one dedicated commit
shared with the collision change (Gate 9's golden migration), so the migration happens once.
The Gate 7/8 harness readouts are the regression instrument: the open-arena mirror skew must
fall below the pre-fix baseline of 32, and Gate 8's map-fairness contract (lopsided-gate skew >
open-arena skew) must hold on re-derived numbers.

## Rejected

- **Harness-side compensation** (weighting orientations to hide the bias):
  `docs/decisions/balance-sampling.md` draws this line explicitly — a sim finding gets a sim
  fix, never a measurement workaround.
- **Per-tick randomized movement order (as the fix for the aim asymmetry):** turns the
  information bias into noise instead of removing it — the snapshot removes it structurally.
  Note the scope: the *contention* channel (who wins a contested tile) has no structural fix,
  only neutral resolution, and there `docs/decisions/unit-collision.md` does adopt a per-tick
  direction draw; the rejection here is of randomizing what a snapshot can simply make fair.
- **Double-buffering the whole entity array (full simultaneous tick):** correct but far more
  machinery than the one phase that needs it; gathering, production, and combat are already
  order-safe or simultaneous.
