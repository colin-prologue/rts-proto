export * from './fixed'
export * from './rng'
export * from './hash'
export * from './types'
export * from './command-types'
export * from './commands'
export * from './step'

import type { State } from './types'
import { seedRng } from './rng'

/** A fresh, empty world. The agent grows this as the RTS loop lands (Gate 3). */
export function initialState(seed: number): State {
  return { tick: 0, rng: seedRng(seed), entities: [] }
}
