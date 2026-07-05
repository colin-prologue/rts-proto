# Build plan — gates

Five gates, in order. Each has a **check script** (`scripts/gates/gateN.*`, wired to `npm run
gate:N`) whose acceptance criteria are written as *mechanical checks* — things Claude runs and whose
output lands in the transcript, so a goal evaluator can confirm them. A gate is complete only when
its check exits 0 and prints `GATE N PASS`.

Each gate also names a **human review** item. Those are judgment calls ("does it feel right") that a
machine cannot check and that are deliberately **not** part of any goal condition — they are for the
maintainer after the gate is green.

---

## Gate 1 — Deterministic sim core (headless, no graphics)

Tick loop, command queue, world state, one unit moving on a grid via a queued MOVE. Seeded RNG in
state. Numeric-model decision recorded and enforced.

**Acceptance (gate:1 exits 0):**
- Runs the same seed + command log twice; asserts identical end-state hashes. Prints both hashes.
- Asserts the end-state hash equals a committed golden value (locks cross-env determinism).
- Negative test: injecting an out-of-band RNG draw makes the golden hash diverge (guard has teeth).
- Grep asserts zero `Math.random`, zero wall-clock calls, zero disallowed numeric types under
  `packages/sim`.
- `docs/decisions/` contains the numeric-model record.

**Human review:** is the tick rate / dt a sane starting feel.

## Gate 2 — Dumb renderer + input→commands

PixiJS renderer that reads sim state and draws colored shapes + debug text, interpolating between
ticks. Camera, box-select, right-click issues a MOVE **command** (not a direct state mutation).
Instant local selection ack; simulated move waits for `N+delay` (delay may be 0 in single-player).
Projection decision recorded.

**Acceptance (gate:2 exits 0):**
- Headless assertion that a right-click maps to a well-formed MOVE command on the correct unit ids
  (input path tested without a real canvas).
- Assertion that the renderer never writes to sim state (render package has no sim-mutation import;
  enforced by boundary lint).
- Interpolation unit test: given two sim states, rendered positions fall between them.
- `docs/decisions/` contains the projection record.

**Human review:** does selection/commanding feel responsive; is the 2.5D projection right.

## Gate 3 — The RTS loop

Resources → workers → gathering → buildings → production queues → supply cap → combat. Units and the
damage-type × armor-type table are **data** (rows / a lookup table), not code. Map = tile grid with
terrain flags. Pathfinding decision recorded.

**Acceptance (gate:3 exits 0):**
- Headless scenario: a worker gathers, a building produces a unit, supply cap blocks overproduction —
  each asserted from sim state, deterministic (golden hash).
- Combat scenario: comp A vs comp B resolves to a fixed winner from the damage/armor table; changing
  one table value flips the outcome (proves content is data-driven and live-tunable).
- Adding a unit = adding a data row with no sim-code change (test loads a unit fixture and it works).
- `docs/decisions/` contains the pathfinding record.

**Human review:** are the counters interesting; does a real build order emerge.

## Gate 4 — Scripted AI player

A rule-based bot that emits commands through the **same** interface as human input ("if enemy army >
mine, retreat and tech"). Validates the command abstraction and provides a sparring partner.

**Acceptance (gate:4 exits 0):**
- Headless match: AI vs AI runs to a terminal state deterministically (golden hash over the full
  command log).
- Assertion that the AI touches sim state only by issuing commands (no privileged mutation path).
- A replay recorded from the AI match re-runs to the identical end-state hash (replay tooling works).

**Human review:** is the AI a useful practice/target dummy.

## Gate 5 — Lockstep multiplayer

Relay (metronome + collator) + leapfrog pipeline + two clients. In-process harness first (no real
sockets needed to prove correctness), then the WebSocket transport.

**Acceptance (gate:5 exits 0):**
- Two in-process sim clients + relay, driven through N turns of scripted commands, assert **matching
  per-turn hashes** the whole way (inputs-only sync proven).
- Empty-frame handling: a turn where a client issues nothing still closes and advances (assert no
  stall).
- Checksum cadence: hashes are exchanged every 32 turns and a deliberately corrupted client is
  detected at the first mismatch (assert desync is *caught*, not silently tolerated).
- Negative test: injecting non-determinism (`Math.random`, wall-clock) into one client makes the
  per-turn hashes diverge and the checksum flags it.
- WebSocket transport passes the same two-client sync over a local loopback relay.

**Human review:** latency feel over a real link; whether delay=2 @ 10 Hz needs tuning.

## Gate 6 — Replay viewer (make the sim watchable)

The first post-campaign tool from the determinism corollary: replays as a first-class surface.
Purpose is twofold — every headless scenario the gates run becomes *watchable* by a human, and
balance/AI tuning gets its review surface (watch a match, edit a data row, watch again). The bar,
set explicitly by the maintainer: a non-author must be able to tell what is going on — damage
flyby numbers, statuses, queued actions, incomes — without reading code.

Pieces:

- **Sim event stream.** `step(state, commands, events?)` accepts an optional out-array and pushes
  plain-data events with attribution (who hit whom for how much; what spawned/died/started/
  finished/was blocked). Decided in `docs/decisions/sim-events.md` — an array, not a callback, so
  no caller code can run mid-step. Events are pure output — no golden may move.
- **Replay file.** JSON `{ name, seed, setup, log }` — enough to reconstruct a scenario from
  nothing. `apps/headless` grows a recorder CLI (`npm run replay:record <scenario>`) that writes
  the Gate 4 AI match as the first checked-in replay fixture.
- **Viewer.** A playground replay mode: all entity types visually distinct, hp bars, damage
  flybys, production queue pips with progress, status glyphs (moving/attacking/gathering/
  constructing), per-player mineral + supply HUD, pause / play / speed / step-one-tick controls.

**Acceptance (gate:6 exits 0):**
- Determinism regression: with an events array attached, every previously committed golden still
  matches — events changed no hashes.
- Event determinism: two identical runs emit identical event logs (compared serialized).
- Attribution: combat-scenario DAMAGE events carry attacker id, target id, and amounts that match
  the damage-table math.
- Round-trip: the recorded Gate 4 replay file re-simulates to the committed `gate4.match.hash`.
- View-model units (headless, no canvas): damage-flyby entries derived from DAMAGE events with
  positions and lifetimes; hp-bar fractions clamped to [0,1]; queue-pip model from building state.
- `docs/decisions/sim-events.md` is ratified (Status: decided).
- gate:6 joins `gates:all` and the final line reads `ALL GATES PASS` again.

**Human review:** load the Gate 4 replay in the browser and judge legibility cold: can you tell
who is winning and why? Are damage numbers, production, and income readable at 1× speed without
explanation? That judgment is the point of the gate and stays out of any goal condition.

## Gate 7 — Headless balance harness (make the sim measurable)

The second post-campaign tool from the determinism corollary: comp-vs-comp win rates at max
speed, no renderer. Purpose: turn "is grunt/archer balanced" from a debate into a number, and
close the tuning loop Gate 6 opened — run a thousand matches, read the rate, export any single
run into the replay viewer, edit a data row, run again.

One design problem is named up front, because it decides everything: **today the seed changes no
outcome.** Nothing in the sim draws from `state.rng`, so N runs of one matchup are N copies of
one match, and a "win rate" over them is vacuous. Where sample variance comes from is the fork
ratified in `docs/decisions/balance-sampling.md` — proposed: seeded spawn jitter at scenario
construction in the harness, each seed played in both orientations, `step()` untouched. Variance
is a property of the *sampling*, not a change to the *game*: no committed golden may move.

Pieces:

- **Comp fixtures.** A comp = a named JSON fixture (unit types and counts), data not code — the
  Gate 3 rule again: adding a comp is adding a file.
- **Sampling model.** Per `docs/decisions/balance-sampling.md`: a run is (matchup, seed,
  orientation); run seeds derive from one base seed by a pure integer mix; bounded per-unit spawn
  offsets are generated from the run seed *outside* the sim; each seed is played with sides
  swapped so first-actor/positional bias cancels out of the comp comparison and surfaces in the
  report instead of hiding in it.
- **Harness CLI.** `apps/headless` grows `npm run balance -- <compA> <compB> [--runs N]
  [--seed S]` (default N=1000): each run goes to elimination or a tick cap (draw), then a
  human-readable table plus a serialized report — per-run rows `{ seed, orientation, winner,
  ticks, endHash }` and an aggregate `{ wins, draws, win rate, per-orientation split, mean
  duration, distinct-outcome count }` (the last is the lumpy-distribution guard from the
  balance-sampling record: it exposes when a rate rests on only a few geometry classes).
- **Replay export.** Any run row exports as a Gate 6 replay file (`--replay <run>`) — every
  statistic in the report is watchable in the viewer.

**Acceptance (gate:7 exits 0):**
- Report determinism: the gate's fixed matchup over the committed seed set, run twice, serializes
  byte-identically and hashes to a committed golden.
- Sim untouched: every previously committed golden still matches — variance lives in setup, never
  in `step()`.
- Seeds have teeth: across the committed seed set (both orientations) the designated close
  matchup yields at least one win for *each* comp, and the per-run (winner, ticks) outcomes are
  not all identical — jitter demonstrably reaches outcomes.
- Aggregate data-flip: overriding one damage-table cell flips which comp the report favors
  (Gate 3's live-tunability proof, population version).
- Comp = data: the harness reports on a comp loaded from a new fixture file with no sim or
  harness code change.
- Round-trip: an exported run re-simulates to the `endHash` recorded in its report row.
- `docs/decisions/balance-sampling.md` is ratified (Status: decided).
- gate:7 joins `gates:all` and the final line reads `ALL GATES PASS` again.

**Human review:** run two comps you believe are close at N=1000 — does the number match the
intuition you built watching replays? Export two or three of the minority side's wins: are they
won for interesting reasons (positioning, focus) or degenerate ones (pathing jams, leashing)?
Is the whole loop — edit a row, re-run, re-watch — a five-minute experiment? And read the
per-orientation split: a systematic first-actor bias there is a real sim finding to weigh,
not a harness bug.

## Gate 8 — Maps & terrain as data (make "does this map play fair" answerable)

The charter's third design question gets its surface. A map becomes a JSON fixture — adding a
map is adding a file, never code — and the two existing tools grow hitches so map fairness is
*measurable* (balance harness `--map`) and *watchable* (the viewer renders terrain). The gate
ships **passability terrain only** (chokes, walls, arenas): movement already consumes
`TILE_PASSABLE`, so `step()` is untouched and no committed golden moves. High ground changes
combat and is deliberately deferred to its own decision record — the line is drawn in
`docs/decisions/maps-as-data.md`.

Pieces:

- **Map fixtures.** `{ name, tiles, spawns }`: ASCII tile rows under a fixed legend (`.`
  passable, `#` impassable), a safe-token name, and exactly two muster anchors. Parsed by a
  pure `parseMap` in `packages/sim` (no fs — file I/O stays in apps and tests, the comp split).
  `initialState` gains an optional map argument defaulting to the open 32×32.
- **Replay format v2.** Per `docs/decisions/maps-as-data.md`: `v` absent = v1 = the default
  open map (today's files stay valid); `v: 2` embeds the runtime map `{ w, h, flags }` inline —
  replays stay self-contained ("reconstruct a scenario from nothing"; the map is hashed state,
  so a by-name reference that drifts would silently diverge). The loader refuses unknown
  versions and v/map mismatches loudly.
- **Harness `--map`.** `npm run balance -- <compA> <compB> --map <fixture>`: spawn anchors come
  from the fixture's `spawns`, the report records the map name, and exported runs are v2 files
  embedding the map. The no-map path stays byte-identical — the committed gate 7 report golden
  is the proof (the report only gains a map field when a map is given).
- **Viewer terrain.** The playground draws impassable tiles under the units; the derivation is
  a view-model function testable headless, like Gate 6's flybys and pips.

**Acceptance (gate:8 exits 0):**
- Map = data: a committed map fixture parses to a `WorldMap`; a second committed fixture loads
  and runs with no sim or harness code change.
- Terrain has teeth: on the committed choke fixture, a unit ordered through the wall never
  occupies an impassable tile, and the scenario end-state hashes to a committed golden.
- Sim untouched on the default path: every previously committed golden (gates 1, 3, 4, and the
  gate 7 report hash) still matches.
- Replay v2 round-trip: a run exported from a `--map` report is a v2 file with the map embedded;
  re-simulating it through `buildReplayInitial` lands on the `endHash` in its report row.
- v1 compat + version teeth: the committed gate4-match v1 replay still re-simulates to its
  golden through the same loader; an unknown version or a v/map mismatch is refused loudly.
- The map reaches the measurement: the balance report over the committed seed set on the choke
  fixture is deterministic (own committed golden) and its outcomes differ from the same matchup
  on the default arena.
- Fairness is measurable: a mirror matchup (one comp vs itself) on the committed asymmetric
  fixture shows a larger per-side skew than the same mirror matchup on the default arena —
  differencing out the known movement-order side bias (issue #4) so the number isolates the map.
- Viewer terrain, headless: a view-model unit test derives terrain draw entries with projected
  positions from impassable tiles, no canvas.
- `docs/decisions/maps-as-data.md` is ratified (Status: decided).
- gate:8 joins `gates:all` and the final line reads `ALL GATES PASS` again.

**Human review:** load a choke map in the viewer and judge it cold: can you see the terrain and
read the fight around it? Run a close matchup on the corridor map — do chokes create the
decisions they exist for (concave vs column, range vs melee at a gap)? Read the asymmetric
fixture's per-side skew next to the default arena's: does the fairness number match what
watching the replays tells you? That judgment — *is this map interesting, not just fair* — is
the point of the gate and stays out of any goal condition.

---

## Aggregate

`npm run gates:all` runs the gates in order and prints `GATE N PASS` per gate plus a final
`ALL GATES PASS`. That final line is the single measurable end state for a full-campaign goal.
(Currently gate:1..7; gate:8 joins the loop as part of its own acceptance.)
