// Deterministic state hash (FNV-1a, 32-bit). This is the desync tripwire and the golden-value
// anchor for replays. It must be stable across runs and engines, so it feeds integers in a fixed
// field order and iterates entities by stable id (CONSTITUTION I, IV).

import type { State } from './types'
import { raw } from './fixed'

export type Hash = number // u32

export const hashInit = (): Hash => 0x811c9dc5 >>> 0

/** Fold one 32-bit word into the hash, byte by byte. */
export function hashU32(h: Hash, x: number): Hash {
  let v = x >>> 0
  for (let i = 0; i < 4; i++) {
    h = (h ^ (v & 0xff)) >>> 0
    h = Math.imul(h, 0x01000193) >>> 0
    v = v >>> 8
  }
  return h >>> 0
}

/** Fold an arbitrary integer (may exceed 32 bits or be negative) as two 32-bit halves. */
export function hashNum(h: Hash, x: number): Hash {
  const lo = x >>> 0
  const hi = Math.floor(x / 4294967296) >>> 0
  return hashU32(hashU32(h, lo), hi)
}

/** Canonical hash of full sim state. Entities are hashed in stable id order. */
export function hashState(s: State): Hash {
  let h = hashInit()
  h = hashNum(h, s.tick)
  h = hashU32(h, s.rng)
  const ents = [...s.entities].sort((a, b) => a.id - b.id)
  h = hashNum(h, ents.length)
  for (const e of ents) {
    h = hashNum(h, e.id)
    h = hashNum(h, e.type)
    h = hashNum(h, raw(e.x))
    h = hashNum(h, raw(e.y))
    h = hashNum(h, e.hp)
    // Every simulated field feeds the hash — an unhashed field is an invisible desync channel.
    h = hashU32(h, e.target ? 1 : 0)
    h = hashNum(h, e.target ? raw(e.target.x) : 0)
    h = hashNum(h, e.target ? raw(e.target.y) : 0)
  }
  return h >>> 0
}
