import type { Fixed } from './fixed'
import type { Rng } from './rng'
import type { GameData } from './data'

export const NEUTRAL = -1 // owner of resource nodes

export interface Entity {
  id: number
  /** Key into state.data.units — a unit IS its data row (architecture: content as data). */
  type: string
  owner: number
  x: Fixed
  y: Fixed
  hp: number
  /** Grid destination of an in-flight MOVE; cleared on arrival or STOP. Part of the state hash. */
  target?: { x: Fixed; y: Fixed }
  /** Entity id this unit is attacking (approaches when out of range). */
  attackTarget?: number
  /** Resource node id a worker is assigned to gather from. */
  gatherTarget?: number
  /** Remaining minerals (resource nodes only). */
  amount?: number
  /** Ticks of construction left; >0 means the building is not yet operational. */
  constructing?: number
  /** Production queue (buildings). Only the head item progresses. */
  queue?: { unit: string; remaining: number }[]
}

export interface Player {
  id: number
  minerals: number
  /** Supply reserved at enqueue time and released on unit death (classic RTS accounting). */
  supplyUsed: number
}

/** Tile grid with terrain flags. Bit 0 = passable; future flags: high ground, choke, buildable. */
export const TILE_PASSABLE = 1
export interface WorldMap {
  w: number
  h: number
  flags: number[] // row-major, length w*h
}

export interface State {
  tick: number
  rng: Rng
  entities: Entity[] // invariant: sorted by id (ids only ever increase)
  players: Player[]
  nextEntityId: number
  map: WorldMap
  /**
   * Static content tables (units, damage×armor). NOT hashed: it is configuration every peer
   * loads identically before tick 0, never mutated by step(). If runtime data mutation ever
   * becomes a feature, it must move into hashed state.
   */
  data: GameData
}
