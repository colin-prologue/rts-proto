# Decision: sim event stream — optional sink parameter (proposed)

**Status:** proposed — ratify or replace during Gate 6.

## Problem

The replay viewer must show *why* state changed, not just that it did: damage flyby numbers need
attacker → target → amount, production pips need queue starts/completions, a death flash needs the
kill event. None of that is recoverable from state alone.

## Recommendation

`step(state, commands, sink?)` — an optional third parameter receiving plain data-only events
(`SPAWN`, `DEATH`, `DAMAGE{attacker,target,amount}`, `GATHER{worker,node,amount}`, `TRAIN_START`,
`TRAIN_DONE`, `TRAIN_BLOCKED{reason}`, …) as each phase resolves.

Constraints that keep the constitution intact:

- Events are **output only**: nothing reads them back into simulated state; goldens must not move.
- Events carry **plain integers/ids**, never live references to entities mid-mutation.
- Event **order is deterministic** (it follows the fixed phase + stable-id iteration order), so two
  identical runs emit identical logs — testable exactly like state hashes.
- No sink attached (undefined) is the common case and costs nothing.

## Rejected

- **Derive by state-diffing in the viewer:** no sim change at all, but attribution is lost (two
  simultaneous attackers on one target are indistinguishable) and every new mechanic forces new
  diff heuristics. The viewer would be guessing.
- **Events accumulated inside state:** every event becomes hash surface and replay noise; clearing
  them each tick is bug bait, and it violates "state holds only what the sim needs to advance."
