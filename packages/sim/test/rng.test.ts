import { describe, it, expect } from 'vitest'
import { seedRng, rngU32, rngInt } from '@rts/sim'

describe('seeded rng', () => {
  it('is deterministic for a given seed', () => {
    const seqOf = (seed: number) => {
      let s = seedRng(seed)
      const out: number[] = []
      for (let i = 0; i < 8; i++) { const [v, ns] = rngU32(s); out.push(v); s = ns }
      return out
    }
    expect(seqOf(42)).toEqual(seqOf(42))
    expect(seqOf(42)).not.toEqual(seqOf(43))
  })
  it('rngInt stays in range', () => {
    let s = seedRng(1)
    for (let i = 0; i < 1000; i++) {
      const [v, ns] = rngInt(s, 6)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(6)
      s = ns
    }
  })
})
