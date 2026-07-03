import type { Fixed } from './fixed'
import type { Rng } from './rng'

export interface Entity {
  id: number
  type: number
  x: Fixed
  y: Fixed
  hp: number
}

export interface State {
  tick: number
  rng: Rng
  entities: Entity[]
}
