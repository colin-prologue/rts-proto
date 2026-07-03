# CONSTITUTION.md — non-negotiable invariants

These are the laws that make "ship inputs, not state" correct. Every one is a property that must
be *tested*, not merely intended. If code cannot honor one of these, the design is wrong, not the
law. Each invariant names how it is guarded.

## I. The simulation is a pure reducer

`state(n+1) = step(state(n), commands(n))`. `step()` performs no I/O, reads no clock, and depends
on nothing outside `state` and `commands`. Same `state(0)` + same ordered command stream ⇒ same
`state(n)`, on every machine, forever.
**Guarded by:** a headless test that runs the same seed + command log twice and asserts identical
end-state hashes, and asserts the hash matches a committed golden value (cross-run + cross-env).

## II. Time is the tick, never the wall clock

The sim advances by a fixed `dt` per tick and counts ticks as integers. No sim code reads
`Date.now()`, `performance.now()`, or elapsed frame time. Rendering may read the wall clock; it
only interpolates between the last two sim states and never mutates them.
**Guarded by:** lint/grep gate rejecting clock calls under `packages/sim`, plus the determinism
test (frame-rate-dependent logic breaks the golden hash).

## III. Randomness is seeded state, and call order is part of the contract

The PRNG lives inside `state`, seeded from `state(0)`. Every consumer draws from it; the *order*
of draws is fixed by iterating entities in stable id order. `Math.random()` is banned in the sim.
**Guarded by:** grep gate rejecting `Math.random` under `packages/sim`; a negative test that
injects an out-of-band draw and asserts the golden hash diverges (proving the guard has teeth).

## IV. Deterministic iteration and command ordering

No sim logic depends on hashmap/set iteration order. Entities are iterated by stable id. Commands
for a tick are applied sorted by `(tick, playerId, sequence)` before `step()` runs — identical
order on every peer.
**Guarded by:** the two-client sync test (any ordering divergence surfaces as a hash mismatch).

## V. Only commands cross the wire

The network layer transmits command frames and turn-advancement signals. It never serializes or
syncs unit/world state. Fog-of-war is a client-side *view*, not withheld data (accepted trade-off
for a prototype; revisit only if anti-cheat becomes a goal).
**Guarded by:** the net package exposes no state-serialization path; the sync test proves clients
stay identical from commands alone.

## VI. The numeric model is decided and enforced

Simulated quantities use the numeric representation chosen in the numeric-model decision record
(fixed-point is the default recommendation for web; see architecture). Until that record exists,
no floats enter simulated state.
**Guarded by:** the decision record must exist before Gate 1 can be marked complete; type-level
representation (e.g. a `Fixed` newtype) makes accidental float entry a compile error.

## VII. The sim is single-threaded and synchronous

`step()` runs to completion synchronously. No async, workers, or threads inside a tick. Parallelism
lives outside the sim (rendering, headless batch runs across independent seeds).
**Guarded by:** `step()` signature is synchronous; review rejects async in `packages/sim`.

---

**Corollary — the payoff.** Because I–VII hold, three tools come for free and should be built as
first-class: **replays** (a recorded command log replayed against the seed), **headless balance
runs** (the sim at max speed with no renderer, fighting comps thousands of times for win rates),
and a **single command interface** shared by human input and AI players.
