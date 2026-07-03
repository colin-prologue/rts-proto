import { describe, it, expect } from 'vitest'
import { fromInt, fromFloat, toFloat, add, sub, mul, div, cmp, floorToInt } from '@rts/sim'

describe('fixed-point', () => {
  it('round-trips integers exactly', () => {
    expect(toFloat(fromInt(7))).toBe(7)
    expect(floorToInt(fromInt(7))).toBe(7)
  })
  it('adds and subtracts exactly', () => {
    expect(toFloat(add(fromInt(3), fromInt(4)))).toBe(7)
    expect(toFloat(sub(fromInt(3), fromInt(4)))).toBe(-1)
  })
  it('multiplies without float drift (BigInt intermediate)', () => {
    expect(toFloat(mul(fromFloat(1.5), fromFloat(2.5)))).toBeCloseTo(3.75, 4)
    // large operands that would overflow 2^53 as raw*raw:
    const big = mul(fromInt(100000), fromInt(100000))
    expect(floorToInt(big)).toBe(100000 * 100000)
  })
  it('divides deterministically', () => {
    expect(toFloat(div(fromInt(7), fromInt(2)))).toBeCloseTo(3.5, 4)
  })
  it('compares by sign of difference', () => {
    expect(cmp(fromInt(2), fromInt(5))).toBeLessThan(0)
    expect(cmp(fromInt(5), fromInt(5))).toBe(0)
  })
})
