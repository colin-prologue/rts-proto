// Lockstep relay (metronome + collator) + leapfrog client. ONLY commands cross the wire
// (CONSTITUTION V): CommandFrame carries commands and an optional checksum — there is no
// state-serialization path in this package. The relay never simulates and is not an authority;
// it collects one frame per peer per turn, bundles them sorted by playerId, broadcasts, and
// compares the checksums peers volunteer every CHECKSUM_EVERY turns.
import type { Command, State } from '@rts/sim'
import { step, hashState } from '@rts/sim'

export interface CommandFrame {
  playerId: number
  executeTurn: number // = issueTurn + DELAY; travels with the frame
  seq: number
  commands: Command[] // empty array is legal and REQUIRED (idle is a message)
  checksum?: number // sim-state hash of turn executeTurn-DELAY, emitted every CHECKSUM_EVERY turns
}

export interface TurnPacket {
  turn: number
  frames: CommandFrame[] // sorted by playerId before broadcast
}

export const DELAY = 2
export const CHECKSUM_EVERY = 32

export class Relay {
  private expected: number
  private listeners = new Map<number, (p: TurnPacket) => void>()
  private frames = new Map<number, Map<number, CommandFrame>>()
  private nextTurn = 0
  private draining = false
  /** First turn where peers' volunteered checksums disagreed — a caught desync. */
  desyncedAt: number | null = null

  constructor(expectedPeers = 2) {
    this.expected = expectedPeers
  }

  /** Register a peer and its broadcast channel. The turn clock starts once all peers are in. */
  connect(playerId: number, onPacket: (p: TurnPacket) => void): void {
    this.listeners.set(playerId, onPacket)
    this.drain()
  }

  /** Collect a peer's frame for its executeTurn. */
  submit(frame: CommandFrame): void {
    let turn = this.frames.get(frame.executeTurn)
    if (!turn) this.frames.set(frame.executeTurn, (turn = new Map()))
    turn.set(frame.playerId, frame)
    this.drain()
  }

  /** True once every connected peer has submitted a frame for `turn`. */
  ready(turn: number): boolean {
    return this.listeners.size === this.expected && this.frames.get(turn)?.size === this.expected
  }

  /** Bundle a ready turn (sorted by playerId) and compare volunteered checksums. */
  bundle(turn: number): TurnPacket {
    const frames = [...this.frames.get(turn)!.values()].sort((a, b) => a.playerId - b.playerId)
    const sums = frames.filter((f) => f.checksum !== undefined).map((f) => f.checksum!)
    if (sums.length > 1 && new Set(sums).size > 1 && this.desyncedAt === null) {
      this.desyncedAt = turn
    }
    return { turn, frames }
  }

  // Broadcasting a packet triggers peers to submit their next frames synchronously (in-process
  // harness) — the guard makes reentrant submits store-and-return while the outer loop advances.
  private drain(): void {
    if (this.draining) return
    this.draining = true
    while (this.ready(this.nextTurn)) {
      const packet = this.bundle(this.nextTurn)
      this.frames.delete(this.nextTurn)
      this.nextTurn++
      for (const l of this.listeners.values()) l(packet)
    }
    this.draining = false
  }
}

export interface Client {
  /** On receiving TurnPacket T: apply it, advance to T, then emit local frame for T + DELAY. */
  onPacket(packet: TurnPacket): void
  /** Seed the pipeline: send (empty) frames for turns 0..DELAY-1. Call once all peers are wired. */
  start(): void
  readonly state: State
  /** Per-turn state hashes — the sync record the gate test compares across clients. */
  readonly hashes: Map<number, number>
}

export interface ClientOptions {
  playerId: number
  initial: State
  send: (f: CommandFrame) => void
  /** Scripted/live input source: commands to stamp for `executeTurn`. Default: idle. */
  local?: (state: State, executeTurn: number) => Command[]
  /** Stop sending frames past this turn (harness bound). */
  maxTurn?: number
  /**
   * The reducer driving this client — defaults to the sim's step(). A seam for the gate's
   * negative test, which injects a nondeterministic reducer into ONE client and asserts the
   * checksum cadence catches the divergence.
   */
  stepFn?: (s: State, c: Command[]) => State
}

export function createClient(o: ClientOptions): Client {
  const stepFn = o.stepFn ?? step
  let state = o.initial
  let lastExecuted = -1
  const hashes = new Map<number, number>()

  const sendFrame = (executeTurn: number) => {
    if (o.maxTurn !== undefined && executeTurn > o.maxTurn) return
    const frame: CommandFrame = {
      playerId: o.playerId,
      executeTurn,
      seq: 0,
      commands: o.local?.(state, executeTurn) ?? [],
    }
    if (executeTurn % CHECKSUM_EVERY === 0 && lastExecuted >= 0) {
      frame.checksum = hashes.get(lastExecuted)
    }
    o.send(frame)
  }

  return {
    start() {
      for (let t = 0; t < DELAY; t++) sendFrame(t) // nothing a player did can execute before DELAY
    },
    onPacket(packet) {
      const commands = packet.frames.flatMap((f) => f.commands)
      state = stepFn(state, commands) // step() itself re-sorts by (playerId, seq) — CONSTITUTION IV
      lastExecuted = packet.turn
      hashes.set(packet.turn, hashState(state))
      sendFrame(packet.turn + DELAY) // receiving T is the metronome tick for T+DELAY
    },
    get state() {
      return state
    },
    get hashes() {
      return hashes
    },
  }
}
