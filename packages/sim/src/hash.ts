// Deterministic state hash (FNV-1a, 32-bit). This is the desync tripwire and the golden-value
// anchor for replays. It must be stable across runs and engines, so it feeds integers in a fixed
// field order and iterates entities by stable id (CONSTITUTION I, IV).
//
// Every SIMULATED field feeds the hash — an unhashed field is an invisible desync channel.
// state.data is deliberately excluded: it is static config loaded identically by every peer
// before tick 0 and never mutated by step() (see types.ts).

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

/** Fold a string as length + char codes (unit type keys, queue entries). */
export function hashStr(h: Hash, s: string): Hash {
  h = hashNum(h, s.length)
  for (let i = 0; i < s.length; i++) h = hashU32(h, s.charCodeAt(i))
  return h
}

/** Canonical hash of full sim state. Entities are hashed in stable id order. */
export function hashState(s: State): Hash {
  let h = hashInit()
  h = hashNum(h, s.tick)
  h = hashU32(h, s.rng)
  h = hashNum(h, s.nextEntityId)

  h = hashNum(h, s.players.length)
  for (const p of s.players) {
    h = hashNum(h, p.id)
    h = hashNum(h, p.minerals)
    h = hashNum(h, p.supplyUsed)
  }

  h = hashNum(h, s.map.w)
  h = hashNum(h, s.map.h)
  for (const f of s.map.flags) h = hashU32(h, f)

  const ents = [...s.entities].sort((a, b) => a.id - b.id)
  h = hashNum(h, ents.length)
  for (const e of ents) {
    h = hashNum(h, e.id)
    h = hashStr(h, e.type)
    h = hashNum(h, e.owner)
    h = hashNum(h, raw(e.x))
    h = hashNum(h, raw(e.y))
    h = hashNum(h, e.hp)
    h = hashU32(h, e.target ? 1 : 0)
    h = hashNum(h, e.target ? raw(e.target.x) : 0)
    h = hashNum(h, e.target ? raw(e.target.y) : 0)
    h = hashNum(h, e.attackTarget ?? -1)
    h = hashNum(h, e.gatherTarget ?? -1)
    h = hashNum(h, e.amount ?? -1)
    h = hashNum(h, e.constructing ?? 0)
    const q = e.queue ?? []
    h = hashNum(h, q.length)
    for (const item of q) {
      h = hashStr(h, item.unit)
      h = hashNum(h, item.remaining)
    }
  }
  return h >>> 0
}
