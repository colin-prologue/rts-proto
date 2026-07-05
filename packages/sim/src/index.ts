export * from './fixed'
export * from './rng'
export * from './hash'
export * from './types'
export * from './data'
export * from './events'
export * from './command-types'
export * from './commands'
export * from './step'
export * from './replay-file'
export * from './map-fixture'

import type { State, WorldMap } from './types'
import { TILE_PASSABLE } from './types'
import { nearestPassable } from './map-fixture'
import type { GameData } from './data'
import { DEFAULT_DATA } from './data'
import { seedRng } from './rng'
import { type Fixed, fromInt } from './fixed'
import { step } from './step'

/**
 * A fresh world: open 32×32 map (or a given one — maps are data, docs/decisions/maps-as-data.md),
 * two players, one player-0 scout at (1,1) so a queued MOVE has something to move. Scenarios and
 * tests grow worlds from here with spawn().
 * Entities are kept sorted by id — step() iterates in array order (CONSTITUTION IV).
 */
export function initialState(seed: number, data: GameData = DEFAULT_DATA, map?: WorldMap): State {
  const w = 32
  const h = 32
  // On a custom map the scout's home tile may be a wall or out of bounds — nudge it to the
  // nearest passable tile so no world ever starts with an entity inside terrain. The open
  // default map keeps the literal (1,1), so every committed golden stays byte-identical.
  const at = map ? nearestPassable(map, 1, 1) : { x: 1, y: 1 }
  return {
    tick: 0,
    rng: seedRng(seed),
    entities: [{ id: 1, type: 'scout', owner: 0, x: fromInt(at.x), y: fromInt(at.y), hp: data.units.scout.hp }],
    players: [
      { id: 0, minerals: 200, supplyUsed: 1 }, // the starting scout holds 1 supply
      { id: 1, minerals: 200, supplyUsed: 0 },
    ],
    nextEntityId: 2,
    map: map ?? { w, h, flags: new Array(w * h).fill(TILE_PASSABLE) },
    data,
  }
}

/**
 * Replay: fold a recorded per-tick command log over an initial state. Because the sim is a pure
 * reducer, this reproduces a full match byte-for-byte — the first of the free tools determinism
 * buys (CONSTITUTION corollary).
 */
export function replay(initial: State, log: import('./command-types').Command[][]): State {
  let s = initial
  for (const cmds of log) s = step(s, cmds)
  return s
}

/**
 * Pure world-building helper for scenarios, fixtures, and match setup: returns a new state with
 * one entity of `type` appended. Not a gameplay path — in-game creation goes through BUILD/TRAIN
 * commands inside step().
 */
export function spawn(state: State, type: string, owner: number, x: Fixed, y: Fixed): State {
  const spec = state.data.units[type]
  const e = {
    id: state.nextEntityId,
    type,
    owner,
    x,
    y,
    hp: spec.hp,
    ...(spec.amount !== undefined ? { amount: spec.amount } : {}),
  }
  const players = state.players.map((p) =>
    p.id === owner ? { ...p, supplyUsed: p.supplyUsed + spec.supply } : p
  )
  return { ...state, entities: [...state.entities, e], players, nextEntityId: state.nextEntityId + 1 }
}
