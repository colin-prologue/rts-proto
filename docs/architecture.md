# Architecture

## The spine

Build the game as a **deterministic simulation that consumes commands**, with rendering, AI, and
networking as consumers sitting on top. This is how the era's games worked (deterministic lockstep:
every machine runs the identical sim and exchanges only inputs). Committing to it early buys the
entire prototyping toolkit — replays, headless balance testing, one command interface for humans
and AI, and multiplayer as "ship the commands" rather than a rewrite.

Two structural splits:

- **Sim / render on a fixed tick.** The sim steps at a low logical rate; the renderer runs at any
  FPS and interpolates between the last two sim states. This is what makes the renderer swappable
  and the headless mode possible.
- **Content as data, not code.** A unit is a row of stats; a counter relationship is two edited
  numbers; a map is a tile grid. Design questions become data changes, run headless (balance) or
  live (feel), kept or reverted.

## Decisions already made (locked)

Reference these by their plain-language name, not an ID.

- **Deterministic lockstep, not state replication.** Consistency comes from every peer running the
  same pure sim. Rejected: authoritative-server snapshots — heavier, and it throws away the free
  toolkit above. Cost accepted: clients hold full world state, so fog is view-only.
- **Host-relay (star) topology; peers are equally authoritative.** One thin coordinator (a peer or
  a dumb server) forwards command frames and runs the turn clock. It is a *metronome + collator*,
  **not** a simulator and **not** an authority. Avoids N² connections and NAT pain while staying
  true lockstep.
- **Leapfrog command pipeline.** A command issued on turn N is stamped to execute on turn `N+delay`
  and broadcast, so it reaches everyone before the tick that consumes it. Three turns are always in
  flight (executing / in transit / being collected). **Empty frames are mandatory** — "I did
  nothing" is still a message, or the turn never closes.
- **`delay = 2`, fixed, at the start.** Sized against p99 latency + jitter, not average — two turns
  absorb a spike invisibly. Adaptive turn length / dynamic jitter buffer is **deferred**.
- **Collapse sim tick = command turn at 10 Hz (100 ms) to begin.** One clock is far easier to
  reason about and debug. Render at 60 FPS interpolated. Split the two clocks later only if smoother
  sim than command granularity is wanted (sim tick as a clean multiple of the turn).
- **Instant local UI acknowledgment.** Selection flashes / unit acks fire on click immediately; the
  simulated effect still waits for `N+delay`. Perceptual responsiveness without breaking lockstep.
- **WebSocket-through-relay transport for the prototype.** Trivial, ordered, reliable; the relay is
  a natural WS hub, and at 10 Hz / delay 2 the latency budget is comfortable. Keep the frame format
  transport-agnostic (just bytes) so swapping to WebRTC / WebTransport later is a transport change,
  not a protocol change. **Deferred:** WebRTC DataChannel (P2P, sub-100 ms), WebTransport (QUIC).
- **Plain typed entities first; ECS only when the pain justifies it.** ECS is the natural fit for
  "experiment with unit composition," but it is easy to over-engineer in week one.

## Command frame + desync detection

```
CommandFrame {
  playerId:    u8
  executeTurn: u32          // = issueTurn + delay; travels with the frame
  seq:         u16          // per-player ordering within a turn
  commands:    Command[]    // empty array is legal and required
  checksum?:   u32          // sim-state hash, emitted every 32 turns
}
Command { type: MOVE|ATTACK|BUILD|TRAIN|STOP|..., unitIds: u32[], payload: {...} }
```

The relay collects frames stamped `executeTurn = T` from **all** peers, bundles them into a
`TurnPacket{ T, frames[] }` sorted by `playerId`, broadcasts it, and advances. Receiving packet `T`
is what triggers a peer to send its frame for `T + delay` — the pipeline self-clocks off broadcasts.
Every peer hashes full sim state every 32 turns; the first mismatch is a desync caught at the source.

## Decisions left open — ratify with a record before the gate that needs each

- **Numeric model (needed before Gate 1 exit).** *Recommendation: fixed-point integer math* for all
  simulated quantities. Cross-engine float determinism is not guaranteed for transcendentals
  (V8 / SpiderMonkey / JSC differ), and this must run identically in Node and every browser. Basic
  IEEE-754 add/sub/mul/div is deterministic, so *fenced floats* (integer/quantized at every boundary,
  no `sin/cos/sqrt` in sim) is a lighter alternative if you commit to staying disciplined — but
  fixed-point makes violations a compile error via a `Fixed` newtype. Pick one, record why.
- **Projection (needed by Gate 2).** Dimetric 2:1 (~26.57°, the classic look) vs true isometric vs
  3D under a fixed ortho camera. Drives all art and input math.
- **Pathfinding (needed by Gate 3).** *Recommendation: flow fields* for moving groups; per-unit A*
  degrades badly with army size. Grid + terrain flags (passable, high/low ground, choke) either way.

## Free tooling to build as first-class (falls out of determinism)

Replays (command log + seed). Headless balance harness (max-speed, no renderer, comp-vs-comp win
rates over thousands of runs). One command interface for human input and AI — the AI player queues
the same MOVE/BUILD/ATTACK a mouse would, never a special path.
