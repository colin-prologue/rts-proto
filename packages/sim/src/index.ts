export * from './fixed'
export * from './rng'
export * from './hash'
export * from './types'
export * from './command-types'
export * from './commands'
export * from './step'

import type { State } from './types'
import { seedRng } from './rng'
import { fromInt } from './fixed'

/**
 * A fresh world with one scout at (1,1) so a queued MOVE has something to move (Gate 1).
 * Real world setup (map, players, bases) grows here with the RTS loop (Gate 3).
 * Entities are kept sorted by id — step() iterates in array order (CONSTITUTION IV).
 */
export function initialState(seed: number): State {
  return {
    tick: 0,
    rng: seedRng(seed),
    entities: [{ id: 1, type: 0, x: fromInt(1), y: fromInt(1), hp: 100 }],
  }
}
