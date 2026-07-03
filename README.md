# rts-proto

A prototyping framework for an old-school RTS on a lightweight web stack (2.5D). The goal of the
codebase is to answer design questions cheaply — unit feel, build orders, map fairness — not to ship
a game. It is built spine-first: a **deterministic, command-driven simulation** with rendering, AI,
and **lockstep multiplayer** as consumers on top.

## Read in this order

1. `CLAUDE.md` — project memory; how the agent should work; locked stack.
2. `CONSTITUTION.md` — the determinism invariants that make "ship inputs, not state" correct.
3. `docs/architecture.md` — the spine, locked decisions with rationale, open decisions to ratify,
   the command-frame format.
4. `docs/build-plan.md` — five gates, each with mechanical acceptance criteria.
5. `AGENT_KICKOFF.md` — how to drive this with Claude Code `/goal` (prereqs, kickoff message, and the
   exact goal strings — one max-room option, one phased sequence).

## Layout

```
packages/sim        pure, zero-dep simulation (runs identically in Node + browser)
packages/render     PixiJS renderer — reads sim state, interpolates, never mutates
packages/net        relay (metronome + collator) + client transport
packages/ai         rule-based bot issuing commands through the shared interface
apps/playground     browser harness
apps/headless       Node runner for determinism + balance
scripts/gates       gate1..5 checks → npm run gate:N, npm run gates:all
docs/decisions      decision records (numeric model decided; projection + pathfinding to ratify)
tests/gates/golden  committed golden hashes — the cross-env determinism anchor
```

## Getting started

```
npm install
npm test          # foundation tests (fixed-point, rng, hash) — pass out of the box
npm run gates:all # gate checks — GATE 1 FAIL at baseline until step() is implemented
```

The baseline is intentionally **known-failing**: the harness runs, the trust anchors
(`fixed`/`rng`/`hash`) pass, and each gate flips to `PASS` as its logic lands. Gate 1 records a
golden hash to `tests/gates/golden/gate1.hash` on its first green run — commit that file to pin
every other environment to the same result. Gates **fail while any golden is uncommitted or
modified**: re-recording a golden is a deliberate act, done in its own commit that says why the
hash moved.
