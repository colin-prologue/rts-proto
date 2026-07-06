# rts-proto

## The premise — read this before anything else

**This is not the game.** It is the test bench for one: a space to prove or kill assumptions
about simulation mechanics, gameplay modeling, and baseline networking for an old-school RTS
(Command & Conquer / StarCraft lineage). It is a **visualizer and a rapid tester above all
else** — the questions it exists to answer are *do these units feel right, does this build order
create interesting decisions, does this map play fair*, and every answer should cost a
five-minute experiment, not a two-day rebuild.

That premise has teeth:

- **Graphics come last.** Colored shapes and debug text are the intended art style, unless a
  visual becomes a genuine balance consideration (e.g., whether you can read a fight). This
  stays **ugly but legible** — legibility is load-bearing, polish is not.
- **Mechanics must be provable, not just playable.** Every claim about the sim is backed by a
  machine check; "feels right" is a deliberate human pass on top.
- **Two exit paths, both valid:** this codebase evolves into the full product, or we export the
  findings — decision records, invariants, measured numbers — as the plan for a ground-up build.
  Either way the findings survive; that's why every choice here has a written *why*.

The spine is a **deterministic, command-driven simulation** run in lockstep: every client runs the
full sim, only commands cross the wire, and time is an integer tick counter — never the wall
clock. Rendering, AI, and networking are consumers that sit on top. That single commitment buys
the whole prototyping toolkit for free: replays, a headless balance harness, and one command
interface shared by human input and AI.

## Quick start

```
npm install
npm test            # foundation tests (fixed-point, rng, hash)
npm run gates:all   # every gate check — prints GATE 1..9 PASS + ALL GATES PASS on main
```

Then see it move:

```
npm run dev --workspace apps/playground    # browser playground + replay viewer (Vite)
npm run balance -- grunt-pack archer-pack  # headless win rates over 1000 seeded runs
npm run replay:record gate9-army           # record a scenario to a replay JSON
```

The playground's replay mode loads the checked-in replays under
`apps/playground/public/replays/` — the 40-grunt army crossing a choke is a good first watch.

## New here? Read in this order

1. **[docs/ONBOARDING.md](docs/ONBOARDING.md)** — how to become useful here with minimal
   oversight: the rules of the road, the dev loop, and good first tasks.
2. **[docs/ROADMAP.md](docs/ROADMAP.md)** — visual map of what's built and where it's pointed.
3. **[CONSTITUTION.md](CONSTITUTION.md)** — the seven determinism invariants. These are law;
   every one is machine-checked.
4. **[docs/architecture.md](docs/architecture.md)** — the spine, locked decisions with rationale,
   and the command-frame format.
5. **[docs/build-plan.md](docs/build-plan.md)** — the nine completed gates with their mechanical
   acceptance criteria.

`CLAUDE.md` is the working agreement for AI-agent sessions (spec-first, gate-by-gate); it's a
useful read for humans too.

## Layout

```
packages/sim        pure, zero-dep simulation — runs byte-identically in Node + browser
packages/render     PixiJS renderer — reads sim state, interpolates, never mutates
packages/net        relay (metronome + collator) + client transport
packages/ai         rule-based bot issuing commands through the shared interface
apps/playground     browser harness + replay viewer
apps/headless       Node runner: determinism checks, replay recorder, balance CLI
scripts/gates       gate1..9 checks → npm run gate:N, npm run gates:all
docs/decisions      decision records — every ratified fork, with the why and the rejected paths
docs/archive        historical records (the original /goal campaign that built gates 1–7)
tests/gates/golden  committed golden hashes — the cross-env determinism anchor
```

## How work happens

- **Gate-by-gate.** Progress is a sequence of *gates*: each has mechanical acceptance criteria in
  a check script that must exit 0 and print `GATE N PASS`. Gates 1–9 are done. "Does it feel
  right" is deliberately a human review pass, never a machine check.
- **The forward queue is GitHub issues** (labels `roadmap`, `gate-candidate`, `design-debt`,
  `blocked`) — the only place future work lives, so prose never drifts against it.
  `docs/build-plan.md` describes only gates that exist.
- **Golden hashes are part of done.** Gates fail while a golden under `tests/gates/golden/` is
  uncommitted or modified. Re-recording one is a deliberate act in its own commit that explains
  why the hash legitimately moved.
- **CI runs the same thing you do:** `npm test` + `npm run gates:all` on every PR (merged against
  main, not the branch in isolation) and on every push to main.

## Status

Gates 1–9 merged: deterministic sim core, renderer + input→commands, the full RTS loop
(economy/production/combat as data), scripted AI, lockstep multiplayer with desync detection,
replay viewer, headless balance harness, maps-as-data with terrain, and real movement (flow
fields, unit collision, movement-order fairness). See [docs/ROADMAP.md](docs/ROADMAP.md) for
what's next.
