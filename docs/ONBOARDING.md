# Onboarding — becoming useful here with minimal oversight

This is for a new collaborator. The repo is deliberately legible: every architectural choice has
a written *why*, every completed milestone has a machine check, and the forward queue is entirely
in GitHub issues. If you internalize the mental model below and respect the three laws, you can
work independently from day one.

**First, the premise (from the README, and it governs your priorities): this is not the game.**
It's the test bench — a visualizer and rapid tester for proving or killing assumptions about
simulation mechanics, gameplay modeling, and baseline networking. Graphics come last unless a
visual is a genuine balance consideration; the intended aesthetic is *ugly but legible*. If
you're choosing between making something prettier and making something more provable or more
readable, provable/readable wins every time. The endgame is either evolving this into the full
product or exporting the findings as the plan for a ground-up build — so the durable output of
your work is the *finding* (a decision record, a measured number, a machine check), not the
pixels.

## The mental model (read this twice)

The whole project stands on one commitment: **the simulation is a pure, deterministic reducer.**

```
state(n+1) = step(state(n), commands(n))
```

- Every client runs the **full simulation locally**. Multiplayer never syncs world state — only
  player *commands* cross the wire (lockstep). If two clients ever disagree, that's a desync bug,
  and checksums catch it at the first divergent tick.
- **Time is an integer tick counter.** Nothing in the sim reads a clock. The renderer runs at any
  FPS and interpolates *between* sim states; it never mutates them.
- **Randomness is seeded state.** The PRNG lives inside `state`; `Math.random()` is banned in the
  sim and a grep gate enforces it.
- **Numbers are fixed-point integers** (a `Fixed` newtype), because float determinism across
  browser engines isn't guaranteed.
- **Content is data, not code.** Units, damage tables, comps, and maps are JSON fixtures. A
  balance change is an edited number; a new map is a new file.

Everything else falls out of this: replays are just `seed + command log`, the balance harness is
the sim at max speed with no renderer, and the AI issues commands through the same interface a
mouse does.

## The three laws

1. **`CONSTITUTION.md` is law.** Seven invariants, each machine-guarded. If your change needs to
   violate one, the change is wrong — stop and rethink (or open an issue arguing the law should
   change; don't drift past it).
2. **`packages/sim` stays pure.** Zero imports from render, net, Node APIs, or the wall clock.
   It must run byte-identically in Node and the browser. Gate checks grep for violations.
3. **Golden hashes are sacred.** `tests/gates/golden/` pins the sim's exact behavior. Gates fail
   while a golden is uncommitted or modified. If your change legitimately moves a hash (i.e., it
   changes sim behavior), the re-record is its **own commit** whose message explains why. A golden
   that moved unexpectedly means you broke determinism — investigate, never re-record to make CI
   green.

## Day one

```
git clone <repo> && cd RTS-proto
npm install
npm test            # foundation anchors: fixed-point, rng, hash
npm run gates:all   # ~30s; must end with ALL GATES PASS
```

Then get a feel for what exists:

```
npm run dev --workspace apps/playground
```

Open the playground, switch to replay mode, and load
`gate9-army-choke-crossing.json` — 40 grunts flow-fielding through a choke point. Controls:
pause / play / speed / step one tick (and `,` steps backward). Then run the balance harness:

```
npm run balance -- grunt-pack archer-pack            # 1000 seeded runs, win-rate report
npm run balance -- grunt-pack archer-pack --map choke-corridor
```

The loop that makes this repo worth using: **edit a data row → re-run balance → export an
interesting run → watch it in the viewer.** It should take about five minutes end to end. Try
it: change one cell of the `damageTable` in `packages/sim/src/data.ts` (`DEFAULT_DATA` — the
unit rows and damage table the sim actually uses; the fixtures directory holds comps and maps,
not the core tables), watch the win rate move, then revert.

A golden note on that experiment: while your edit is in place, `npm run gates:all` will fail on
golden-hash mismatches. **That is the pinning working, not something you broke** — the gates
pin content as well as code. Revert and they're green again; *keeping* a content change means
deliberately re-recording the goldens in their own explained commit (see the three laws).

## How work happens

- **The forward queue is GitHub issues** — labels `roadmap`, `gate-candidate`, `design-debt`,
  `blocked`. Nothing future-facing lives in prose docs (deliberately, so docs never drift against
  the queue). Start any work session by reading the open issues.
- **Big work ships as a numbered gate.** A gate-candidate issue graduates via a *planning
  commit*: a `docs/build-plan.md` section with mechanical acceptance criteria, any decision
  record the design fork needs, and known-failing test contracts. The gate is done when
  `npm run gate:N` exits 0 and joins `gates:all`.
- **Small work is a normal branch + PR.** CI (`.github/workflows/gates.yml`) runs `npm test` +
  `npm run gates:all` on your PR *merged against main*, and re-validates open PRs when main
  moves — a green check means green-after-merge, not green-in-isolation.
- **Design forks get a decision record** in `docs/decisions/<plain-language-name>.md`: the
  choice, the why, and the rejected alternatives. Read the existing ones — they're short and
  they're the project's institutional memory.
- **"Does it feel right" is a human review pass**, never a machine check. Each gate in
  `docs/build-plan.md` names its human-review item. Some are still owed (see the roadmap).

## Where things live

| I want to… | Look at |
|---|---|
| understand the sim | `packages/sim/src` — `step.ts` is the whole game loop |
| change unit stats / damage | `packages/sim/src/data.ts` — `DEFAULT_DATA` is the unit-row + damage table source `initialState` and the balance CLI actually use (see the golden note below) |
| add a comp to measure | `tests/gates/fixtures/comps/` (unit types + counts, JSON) |
| add a map | `tests/gates/fixtures/maps/` (ASCII rows; see `docs/decisions/maps-as-data.md`) |
| touch the renderer / viewer | `apps/playground`, `packages/render` (read-only over sim state) |
| touch networking | `packages/net` (relay is a metronome + collator, never an authority) |
| understand a past choice | `docs/decisions/` |
| see how the repo was built | `docs/archive/agent-kickoff.md` (historical) |

## Good first tasks

In rough order of ramp-up value (check the issue for current state before starting):

1. **Watch and poke** (no issue): the day-one loop above. Genuinely the fastest way in.
2. **[#19 — tile-occupancy debug overlay](https://github.com/colin-prologue/rts-proto/issues/19)**: render-only, no sim changes, no
   goldens move. A pure view-model function (state → highlighted tiles) plus a debug toggle in
   the viewer. The ideal shape for a first PR — it follows an established pattern (Gate 6's
   flybys/pips) you can crib from.
3. **[#7 — real-link multiplayer feel session](https://github.com/colin-prologue/rts-proto/issues/7)**: not code — a two-person play
   session over a real network link judging latency feel at delay=2 @ 10 Hz. It has literally
   been waiting for a second human. Do this together early; it's also the fastest tour of the
   net layer.
4. **[#11 — web map editor](https://github.com/colin-prologue/rts-proto/issues/11)**: the next gate candidate, unblocked. Bigger, but
   the issue body already contains the full scope sketch and graduation path.

When in doubt: open an issue and argue the design there before writing code. Written reasoning
is this repo's currency.
