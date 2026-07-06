# agent-kickoff.md — how the Gate 1–7 campaign was run with Claude Code /goal

> **Archived 2026-07-05.** This is the historical record of the goal strings that drove the
> original build campaign (Gates 1–7). All gates through 9 have since merged; the forward queue
> lives in GitHub issues (per `CLAUDE.md`), and new gates carry their `/goal` string on their own
> issue. Nothing here is current process — kept for legibility of how the repo was built.

This repo is the **background context** the agent works against. The `/goal` command wants a short,
*measurable* condition — not a pasted spec. So: drop these files in, paste the kickoff message once,
then set a goal. The goal evaluator is a separate fast model that **only reads the transcript and
runs nothing itself**, so every condition below is phrased as a check the agent runs whose output
lands in the transcript (a gate script exiting 0 and printing a PASS line).

## Prerequisites

- Claude Code with `/goal` support (v2.1.139+). Accept the workspace **trust** dialog — the
  evaluator is part of the hooks system and `/goal` is unavailable without it.
- Turn on **auto mode** if you want turns to run unattended (approves tool calls so each goal turn
  runs without per-tool prompts). `/goal` removes the per-*turn* prompts; auto mode removes the
  per-*tool* ones — you want both for a long autonomous run.
- Baseline the checks: `npm test` passes (foundation anchors) and `npm run gates:all` *runs* and
  stops at `GATE 1 FAIL`. If the check scripts don't execute, the evaluator can never flip to a "yes."

## Step 1 — paste this kickoff message (once)

> Read `CLAUDE.md`, `CONSTITUTION.md`, `docs/architecture.md`, and `docs/build-plan.md` in full.
> The monorepo is already scaffolded (packages `sim`/`render`/`net`/`ai`, apps `playground`/
> `headless`, vitest, `scripts/gates` wired to `npm run gate:N` and `npm run gates:all`). Verify the
> baseline first: `npm test` passes and `npm run gates:all` stops at `GATE 1 FAIL`. Then work the
> gates in `docs/build-plan.md` strictly in order. Do not begin a gate until the prior gate's check
> exits 0. Decision state: the numeric model is decided and implemented; projection and pathfinding
> exist under `docs/decisions/` as **proposals** — before the gate that needs each, either ratify it
> (flip its Status to decided, extending the why) or replace it with a different choice and record
> the reasoning and rejected alternatives. Treat the invariants in `CONSTITUTION.md` as hard
> constraints. Keep `packages/sim` free of render, network, Node, and wall-clock dependencies.
> Commit as you go. Golden hashes under `tests/gates/golden/` must be committed — every gate fails
> while a golden is uncommitted or modified, and any change to a golden must be its own commit whose
> message explains why the hash legitimately moved.

## Step 2 — set the goal

You have two options. Pick based on how much you want to babysit.

### Option A — max room, one campaign goal

Aggressive: one condition, agent runs the whole plan. Best-effort autonomy; the risk is a long loop
and an evaluator that only flips at the very end, so keep the constraints explicit.

```
/goal All five gates pass. Prove it by running `npm run gates:all` and showing its output in the
transcript containing "GATE 1 PASS" through "GATE 5 PASS" and a final "ALL GATES PASS". Constraints
that must hold in the passing state: packages/sim imports nothing from render, net, Node APIs, or
the wall clock, and gate:1's comment-stripped scan of packages/sim for Math.random / Date.now /
performance.now passes as part of the run; the projection and pathfinding decision records under
docs/decisions/ carry Status: decided; golden hash files under tests/gates/golden are committed,
and any change to a golden is its own commit explaining why the hash moved; the two-client lockstep
sync test in gate:5 asserts matching per-turn hashes and detects an injected non-determinism. Do
not weaken, delete, or special-case any gate check to make it pass; do not hardcode expected hashes
to shortcut a computation; placeholder expect.fail contracts in tests/gates may only be replaced by
implementations of the contract described in their comments, never by looser assertions; do not
edit scripts/gates except to add new gates.
```

The "do not" clauses matter: without them the cheapest way to pass a check is to gut it. State
the anti-gaming constraints or the loop will find the shortcut.

### Option B — recommended, phased goals (run in sequence)

Safer and truer to spec-driven work: one measurable goal per gate. Set it, let it clear, eyeball the
human-review item for that gate, then set the next. Each clears automatically when met.

```
/goal `npm run gate:1` exits 0 and prints "GATE 1 PASS": same seed + command log hashes identical
across two runs and equal to the golden value committed under tests/gates/golden; an injected
out-of-band RNG draw diverges the end-state hash; the gate's comment-stripped scan finds no
Math.random or wall-clock reads under packages/sim; a numeric-model decision record exists. Do not
delete or weaken any check; do not hardcode the golden hash to a literal to skip the computation.
```
```
/goal `npm run gate:2` exits 0 and prints "GATE 2 PASS": right-click maps to a well-formed MOVE
command on the correct unit ids; the render package's imports from @rts/sim are types or
allowlisted pure converters only (the boundary lint in the gate passes unmodified); interpolation
places rendered positions between two given sim states; the projection decision record carries
Status: decided. Do not bypass or extend the boundary lint allowlist.
```
```
/goal `npm run gate:3` exits 0 and prints "GATE 3 PASS": a headless economy+production+supply
scenario and a combat scenario each resolve deterministically to the committed golden hash; changing
one damage/armor table value flips the combat outcome; adding a unit via a data fixture needs no sim
code change; the pathfinding decision record carries Status: decided. Do not encode outcomes in code
instead of data.
```
```
/goal `npm run gate:4` exits 0 and prints "GATE 4 PASS": an AI-vs-AI headless match runs to a
terminal state at a committed golden hash; the AI mutates sim state only via issued commands; a
replay of the match re-runs to the identical end-state hash. Do not give the AI a privileged
mutation path.
```
```
/goal `npm run gate:5` exits 0 and prints "GATE 5 PASS": two in-process clients + relay hold matching
per-turn hashes across N scripted turns; a turn with an empty frame still advances (no stall);
checksums every 32 turns catch a corrupted client at the first mismatch; injecting Math.random or
wall-clock into one client diverges the per-turn hashes; the same sync passes over the local
WebSocket transport. Do not sync any world state over the wire — commands only.
```

### Gate 6 (post-campaign) — replay viewer

```
/goal `npm run gate:6` exits 0 and prints "GATE 6 PASS", and `npm run gates:all` now includes
gate 6 and prints "GATE 1 PASS" through "GATE 6 PASS" plus "ALL GATES PASS": with an event sink
attached to step(), every previously committed golden still matches (events are pure output);
two identical runs emit identical serialized event logs; DAMAGE events carry attacker id, target
id, and table-accurate amounts; a replay JSON recorded by the headless CLI re-simulates to the
committed gate4.match.hash; view-model unit tests cover damage flybys, hp fractions, and queue
pips with no canvas; the sim-events decision record carries Status: decided. Do not weaken any
existing gate, test, or golden; placeholder expect.fail contracts in gate6 may only be replaced
by implementations of the contracts described in their comments.
```

The viewer's *legibility* — flybys, statuses, queue pips readable by a non-author at 1× speed —
is the Gate 6 human-review item and deliberately not in the goal condition (see build-plan).

### Gate 7 (post-campaign) — headless balance harness

```
/goal `npm run gate:7` exits 0 and prints "GATE 7 PASS", and `npm run gates:all` now includes
gate 7 and prints "GATE 1 PASS" through "GATE 7 PASS" plus "ALL GATES PASS": the balance report
over the committed seed set serializes byte-identically across two invocations and hashes to the
committed golden; no previously committed golden moves — packages/sim behavior is untouched, and
variance comes from seeded setup jitter per docs/decisions/balance-sampling.md, which carries
Status: decided; across the committed seeds the designated close matchup yields at least one win
for each comp and non-identical per-run (winner, ticks) outcomes; overriding one damage-table
cell flips the favored comp in the aggregate; a comp loads from a new JSON fixture with no sim or
harness code change; an exported run re-simulates to the endHash recorded in its report row. Do
not weaken any existing gate, test, or golden; placeholder expect.fail contracts in gate7 may
only be replaced by implementations of the contracts described in their comments; do not draw
variance from Math.random, the wall clock, or any change to step().
```

Whether the *numbers are believable* — rates matching the intuition built in the replay viewer,
minority-side wins won for interesting reasons, the edit-row → re-run → re-watch loop staying a
five-minute experiment — is the Gate 7 human-review item and stays out of the goal condition.

## Why the goal excludes "is it fun"

The evaluator can't judge feel — it reads text, runs nothing. "Fun / responsive / interesting
counters" are the **human-review** items listed per gate in `docs/build-plan.md`. Check those
yourself once a gate is green. Encoding quality as a mechanical proxy where possible (a table value
that *must* flip an outcome, a hash that *must* stay stable) is how the checkable gates still defend
the design, but the taste call stays yours.

## After the gates

The determinism you just locked hands you three tools for free — replays (Gate 6), the headless
balance harness (Gate 7), and one command interface for humans and AI (in place since Gate 4).
Those are where the actual design iteration happens.

What comes next is **not tracked in this file**: the forward queue — candidate gates, design
debts, findings — lives in the repo's GitHub issues (labels `roadmap` / `gate-candidate` /
`design-debt` / `blocked`), per CLAUDE.md. An issue becomes the next gate via a planning commit
and carries its own `/goal` string in a `## Goal` section of its body from that moment — this
file stops accumulating goal strings after Gate 7 (the ones above are the historical record of
the campaign). The issue closes when its gate merges. This file and `docs/build-plan.md` only
ever describe gates that exist.
