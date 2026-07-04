# Decision: balance sampling — where win-rate variance comes from

**Status:** proposed (ratify before or during the Gate 7 run — flip to decided, extending the
why, or replace with a different choice and record the reasoning).

## Problem

The sim is a pure reducer: same setup + seed + commands ⇒ the same match, forever. And today the
seed is inert — nothing in `packages/sim` draws from `state.rng` (it is threaded and hashed, never
consumed). So "win rate over 1000 seeded runs" measures nothing until something varies per run.
What varies, and where that variation enters, is a real fork: each option prices differently
against the constitution and the committed goldens.

## Choice (proposed)

**Seeded setup jitter, sides swapped per seed; the sim untouched.**

- A run is `(matchup, seed, orientation)`. Run seeds derive from one base seed via a pure integer
  mix (committed constants — reproducible forever, no `Math.random`, no wall clock).
- Variance enters **only at scenario construction**, in the harness (`apps/headless`): bounded
  per-unit spawn offsets drawn from a tiny pure PRNG over the run seed. Positioning luck — the
  same kind of variance a human opponent supplies — not new game rules. The run seed is also
  written into the exported `ReplayFile.seed`, so any run reconstructs exactly in the viewer.
- Each seed is played in **both orientations** (comp A as player 0, then as player 1). Aggregates
  are computed over the pair, so any first-actor or entity-id-order bias in the sim cancels out
  of the comp comparison — and is surfaced separately as a per-orientation split in the report,
  rather than silently distorting the rates.
- `step()` is not modified. Every previously committed golden must still match — this gate builds
  a measurement instrument, not a game change.

## Why not draw variance from `state.rng` inside the sim

Rejected for now, deliberately:

- Making combat/targeting/damage consume the RNG would move **every** committed golden across
  gates 1–6 — including the checked-in gate4 match replay — in a single tooling change.
- It changes how the game *plays* as a side effect of building a *measurement tool*: a design
  decision (damage variance? random tie-breaking?) smuggled in as infrastructure. If the design
  later wants in-sim randomness, that is its own record, with its own deliberately re-recorded
  goldens.

## Rejected

- **`Math.random` / OS entropy in the harness:** unreproducible. A run you cannot replay
  contradicts the corollary the harness exists to exploit.
- **Varying the map per run:** conflates map balance with comp balance. Map variation is its own
  future axis, with its own sampling story.
- **Varying the AI policy per run:** measures the bot, not the comps. Comp balance wants a fixed
  engagement policy across every sample.
