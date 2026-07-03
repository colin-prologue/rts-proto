// Seeded PRNG (mulberry32). The RNG state is part of sim state and is threaded explicitly —
// there is no global generator and Math.random is banned in the sim (CONSTITUTION III).
//
// The surface is integer-only so no float ever enters simulated state. Callers must draw in a
// fixed order (iterate entities by stable id) so the sequence is identical on every peer.

export type Rng = number // u32 state

export const seedRng = (seed: number): Rng => seed >>> 0

/** Advance the generator once. Returns [value as u32, next state]. Pure. */
export function rngU32(state: Rng): [number, Rng] {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0
  t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0
  const value = (t ^ (t >>> 14)) >>> 0
  return [value, next]
}

/** Uniform integer in [0, n). Pure. Returns [value, next state]. */
export function rngInt(state: Rng, n: number): [number, Rng] {
  const [v, s] = rngU32(state)
  return [v % n, s]
}
