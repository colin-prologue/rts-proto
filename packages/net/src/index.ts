// Lockstep relay (metronome + collator) + leapfrog client. ONLY commands cross the wire
// (CONSTITUTION V). The relay never simulates and is not an authority. Lands in Gate 5.
import type { Command } from '@rts/sim'

export interface CommandFrame {
  playerId: number
  executeTurn: number // = issueTurn + DELAY; travels with the frame
  seq: number
  commands: Command[] // empty array is legal and REQUIRED (idle is a message)
  checksum?: number // sim-state hash, emitted every CHECKSUM_EVERY turns
}

export interface TurnPacket {
  turn: number
  frames: CommandFrame[] // sorted by playerId before broadcast
}

export const DELAY = 2
export const CHECKSUM_EVERY = 32

export class Relay {
  /** Collect a peer's frame for its executeTurn. */
  submit(_frame: CommandFrame): void {
    throw new Error('NotImplemented: collect frames until all peers reported for turn T — Gate 5')
  }
  /** True once every connected peer has submitted a frame for `turn`. */
  ready(_turn: number): boolean {
    throw new Error('NotImplemented — Gate 5')
  }
  /** Bundle a ready turn (sorted by playerId) for broadcast. */
  bundle(_turn: number): TurnPacket {
    throw new Error('NotImplemented: sort by playerId, then broadcast — Gate 5')
  }
}

export interface Client {
  /** On receiving TurnPacket T: apply it, advance to T, then emit local frame for T + DELAY. */
  onPacket(packet: TurnPacket): void
}

export function createClient(): Client {
  throw new Error('NotImplemented: leapfrog client — receiving T triggers sending T+DELAY — Gate 5')
}
