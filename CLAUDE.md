# CLAUDE.md — project memory

## What this is

A **prototyping framework** for an old-school RTS (think Command & Conquer / StarCraft /
Warcraft), targeting a lightweight web stack with 2.5D rendering. The point of the codebase
is not to ship a game — it is to answer design questions cheaply: *do these units feel right,
does this build order create interesting decisions, does this map play fair.* Architecture
bends toward making each of those a five-minute experiment, not a two-day rebuild.

The first two things worth building for real are the **deterministic simulation core** and the
**lockstep multiplayer** on top of it. Everything else (renderer, AI, content) hangs off those.

## How to work

- **Spec-first, gate-by-gate.** Read `docs/architecture.md` and `docs/build-plan.md` before
  writing code. Implement one gate at a time, in order. Do not start a gate until the previous
  gate's check script exits 0.
- **The invariants in `CONSTITUTION.md` are law.** They are what makes inputs-not-state work.
  If a change would violate one, stop and reconsider the design instead.
- **Ratify open decisions with a decision record.** `docs/architecture.md` lists a few forks
  left open (numeric model, projection, pathfinding). Before the gate that needs one, pick a
  direction, write a short record in `docs/decisions/<plain-language-name>.md` capturing the
  *why* and the rejected alternatives, then implement it. Preserve the reasoning — this repo is
  meant to be legible years later.
- **Keep the sim core pure.** `packages/sim` has **zero** dependencies on rendering, networking,
  Node APIs, or wall-clock. It must run byte-identically in Node (headless) and in the browser.
  That property is a test target, not an aspiration.

## Stack (locked)

- TypeScript everywhere. Package layout: `packages/sim` (pure), `packages/render` (PixiJS),
  `packages/net` (relay + client transport), `packages/ai` (rule bot), `apps/playground`
  (browser harness), `apps/headless` (Node runner for determinism + balance).
- Test runner: vitest. Gate checks live in `scripts/gates/` and are wired to `npm run gate:N`
  and `npm run gates:all`.
- Renderer: PixiJS (WebGL sprite batching). The renderer only *reads* sim state and interpolates.

## Definition of done

Every gate check in `scripts/gates/` exits 0 and the combined run `npm run gates:all` prints a
`PASS` line for each gate. "Is it fun / does it feel right" is **not** a machine check — that
stays a human review pass and is deliberately excluded from any goal condition.

Golden hashes under `tests/gates/golden/` are part of done: gates fail while a golden is
uncommitted or modified. Re-record a golden only deliberately, in its own commit whose message
explains why the hash legitimately moved.

## Never (in the sim core)

- No floating-point in simulated quantities until the numeric-model decision is recorded (see
  architecture). No `Math.random()` — RNG is seeded sim state. No wall-clock reads — the tick
  counter is the only time. No world-state sync over the network — only commands cross the wire.
