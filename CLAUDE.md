# CLAUDE.md — project memory

## What this is

A **prototyping framework** for an old-school RTS (think Command & Conquer / StarCraft /
Warcraft), targeting a lightweight web stack with 2.5D rendering. **This is not the game** — it
is the test bench for one: a visualizer and rapid tester for proving or killing assumptions
about simulation mechanics, gameplay modeling, and baseline networking. The point is to answer
design questions cheaply: *do these units feel right, does this build order create interesting
decisions, does this map play fair.* Architecture bends toward making each of those a
five-minute experiment, not a two-day rebuild.

The first two things worth building for real are the **deterministic simulation core** and the
**lockstep multiplayer** on top of it. Everything else (renderer, AI, content) hangs off those.
**Graphics come last** unless a visual is a genuine balance consideration (can you read the
fight); the intended aesthetic is *ugly but legible* — never spend effort on polish. The endgame
is either evolving this into a full product or exporting the findings (decision records,
invariants, measured numbers) as the plan for a ground-up build — so the durable output of any
work is the finding, and preserving written reasoning is part of every task.

## How to work

- **Spec-first, gate-by-gate.** Read `docs/architecture.md` and `docs/build-plan.md` before
  writing code. Implement one gate at a time, in order. Do not start a gate until the previous
  gate's check script exits 0.
- **The roadmap lives in GitHub issues; the specs live here.** Candidate gates, design debts,
  and findings are tracked as issues (labels: `roadmap`, `gate-candidate`, `design-debt`,
  `blocked`) — that is the only forward queue, so it never drifts against prose. An issue
  graduates by a planning commit (build-plan section + decision record + known-failing
  contracts), gets its `/goal` string appended to its own body under a `## Goal` heading in a
  fenced block at that moment, and closes when its gate merges. The issue is the run ticket:
  contract in the repo (reviewed), invocation on the issue. Editing an issue body can never
  weaken a gate — every mechanical claim in a goal string is backed by a committed check.
  `docs/build-plan.md` holds only gates that have been specced this way — never future
  intentions.
- **The invariants in `CONSTITUTION.md` are law.** They are what makes inputs-not-state work.
  If a change would violate one, stop and reconsider the design instead.
- **Ratify open decisions with a decision record.** Every fork decided so far has a record
  under `docs/decisions/` (indexed in `docs/architecture.md`). When a new fork emerges, pick a
  direction before the gate that needs it, write a short record in
  `docs/decisions/<plain-language-name>.md` capturing the *why* and the rejected alternatives,
  then implement it. Preserve the reasoning — this repo is meant to be legible years later.
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
