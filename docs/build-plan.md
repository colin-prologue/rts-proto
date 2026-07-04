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

---

## Aggregate

`npm run gates:all` runs gate:1..6 in order and prints `GATE N PASS` per gate plus a final
`ALL GATES PASS`. That final line is the single measurable end state for a full-campaign goal.
