# Decision: sim event stream — optional out-array parameter

**Status:** decided (ratified 2026-07-03, ahead of the Gate 6 run). Revisit only with a
replacement record.

## Problem

The replay viewer must show *why* state changed, not just that it did: damage flyby numbers need
attacker → target → amount, production pips need queue starts/completions, a death flash needs the
kill event. None of that is recoverable from state alone.

## Choice

`step(state, commands, events?: SimEvent[])` — an optional **plain out-array**. When present, the
sim pushes data-only events (`SPAWN`, `DEATH`, `DAMAGE{attacker,target,amount}`,
`GATHER{worker,node,amount}`, `TRAIN_START`, `TRAIN_DONE`, `TRAIN_BLOCKED{reason}`, …) as each
phase resolves. When absent (the common case), emission costs one undefined-check.

Rules that keep the constitution intact:

- Events are **output only**: nothing reads them back into simulated state. Guarded structurally
  by Gate 6's regression check — with an array attached, every committed golden must still match.
- Events carry **plain integers/ids**, never references to live entities.
- Event **order is deterministic** (fixed phase + stable-id iteration order); two identical runs
  emit identical logs — pinned by a gate test, so ordering churn is visible, never silent.

## Why an array and not a callback sink

The originally proposed callback was an impurity vector: it executes caller code *mid-step*, while
entities are half-mutated, and only discipline stops a consumer from observing (or touching) sim
state from inside it. An array cannot run code — the reentrancy hazard is eliminated structurally
instead of by convention, the same reasoning that chose fixed-point over fenced floats.

## Rejected

- **Callback sink (original proposal):** see above — replaced by the out-array on ratification.
- **Derive by state-diffing in the viewer:** no sim change at all, but attribution is lost (two
  simultaneous attackers on one target are indistinguishable) and every new mechanic forces new
  diff heuristics. The viewer would be guessing.
- **Events accumulated inside state:** every event becomes hash surface and replay noise; clearing
  them each tick is bug bait, and it violates "state holds only what the sim needs to advance."
