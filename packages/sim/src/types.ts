import type { Fixed } from './fixed'
import type { Rng } from './rng'

export interface Entity {
  id: number
  type: number
  x: Fixed
  y: Fixed
  hp: number
  /** Grid destination of an in-flight MOVE; cleared on arrival or STOP. Part of the state hash. */
  target?: { x: Fixed; y: Fixed }
}

export interface State {
  tick: number
  rng: Rng
  entities: Entity[]
}
