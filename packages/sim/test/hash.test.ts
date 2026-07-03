import { describe, it, expect } from 'vitest'
import { hashState, initialState, fromInt, type State } from '@rts/sim'

const withEntities = (base: State, ents: State['entities']): State => ({ ...base, entities: ents })

describe('state hash', () => {
  it('is stable for identical state', () => {
    expect(hashState(initialState(7))).toBe(hashState(initialState(7)))
  })
  it('changes when tick or rng changes', () => {
    const a = initialState(7)
    expect(hashState({ ...a, tick: 1 })).not.toBe(hashState(a))
    expect(hashState({ ...a, rng: 999 })).not.toBe(hashState(a))
  })
  it('is independent of entity array order (sorted by id)', () => {
    const base = initialState(7)
    const e1 = { id: 1, type: 'scout', owner: 0, x: fromInt(2), y: fromInt(3), hp: 10 }
    const e2 = { id: 2, type: 'scout', owner: 0, x: fromInt(5), y: fromInt(1), hp: 10 }
    expect(hashState(withEntities(base, [e1, e2]))).toBe(hashState(withEntities(base, [e2, e1])))
  })
})
