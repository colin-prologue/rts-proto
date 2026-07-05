import { describe, it, expect } from 'vitest'
import {
  parseMap,
  nearestPassable,
  buildReplayInitial,
  initialState,
  hashState,
  floorToInt,
  TILE_PASSABLE,
  REPLAY_VERSION,
  type MapFixture,
  type ReplayFile,
} from '../src'

const fixture = (over: Partial<MapFixture> = {}): MapFixture => ({
  name: 'test-map',
  tiles: ['....', '.##.', '....'],
  spawns: [
    { x: 0, y: 0 },
    { x: 3, y: 2 },
  ],
  ...over,
})

describe('parseMap', () => {
  it('parses rows into a row-major flag grid under the fixed legend', () => {
    const { map, spawns, name } = parseMap(fixture())
    expect(name).toBe('test-map')
    expect(map.w).toBe(4)
    expect(map.h).toBe(3)
    expect(map.flags.length).toBe(12)
    expect(map.flags[0]).toBe(TILE_PASSABLE)
    expect(map.flags[1 * 4 + 1]).toBe(0) // '#' at (1,1)
    expect(map.flags[1 * 4 + 2]).toBe(0) // '#' at (2,1)
    expect(spawns).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 2 },
    ])
  })

  it('refuses unknown tiles with coordinates', () => {
    expect(() => parseMap(fixture({ tiles: ['....', '.@#.', '....'] }))).toThrow(/"@" at \(1, 1\)/)
  })

  it('refuses ragged grids, bad names, and bad spawns loudly', () => {
    expect(() => parseMap(fixture({ tiles: ['....', '...'] }))).toThrow(/rectangular/)
    expect(() => parseMap(fixture({ name: '../escape' }))).toThrow(/must match/)
    expect(() => parseMap(fixture({ spawns: [{ x: 0, y: 0 }] }))).toThrow(/exactly two/)
    expect(() => parseMap(fixture({ spawns: [{ x: 0, y: 0 }, { x: 9, y: 9 }] }))).toThrow(/inside 4x3/)
    expect(() => parseMap(fixture({ spawns: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }))).toThrow(/impassable/)
  })
})

describe('nearestPassable', () => {
  it('returns the tile itself when passable, else the nearest by growing rings', () => {
    const { map } = parseMap(fixture())
    expect(nearestPassable(map, 0, 0)).toEqual({ x: 0, y: 0 })
    expect(nearestPassable(map, 1, 1)).toEqual({ x: 0, y: 0 }) // '#' at (1,1); ring scan order
  })

  it('clamps out-of-bounds starts and refuses an all-wall map loudly', () => {
    const { map } = parseMap(fixture())
    expect(nearestPassable(map, 99, 99)).toEqual({ x: 3, y: 2 })
    expect(() => nearestPassable({ w: 2, h: 1, flags: [0, 0] }, 0, 0)).toThrow(/no passable tile/)
  })

  it('the default scout never starts inside terrain on a custom map', () => {
    // (1,1) is a wall in this fixture — the scout must be nudged onto passable ground.
    const { map } = parseMap(fixture())
    const s = initialState(5, undefined, map)
    const scout = s.entities.find((e) => e.id === 1)!
    const tile = map.flags[floorToInt(scout.y) * map.w + floorToInt(scout.x)]
    expect(tile & TILE_PASSABLE).toBe(TILE_PASSABLE)
    // the open default map keeps the literal (1,1) — committed goldens stay byte-identical
    const d = initialState(5).entities.find((e) => e.id === 1)!
    expect([floorToInt(d.x), floorToInt(d.y)]).toEqual([1, 1])
  })
})

describe('replay versioning', () => {
  const base: ReplayFile = { name: 'r', seed: 7, setup: [], log: [] }
  const map = parseMap(fixture()).map

  it('v absent = v1 = the default open map (pre-map files stay valid)', () => {
    const s = buildReplayInitial(base)
    expect(hashState(s)).toBe(hashState(initialState(7)))
  })

  it('v: 2 embeds its map and reconstructs against it', () => {
    const s = buildReplayInitial({ ...base, v: REPLAY_VERSION, map })
    expect(s.map).toEqual(map)
    expect(hashState(s)).toBe(hashState(initialState(7, undefined, map)))
    expect(hashState(s)).not.toBe(hashState(initialState(7))) // the map is hashed state
  })

  it('refuses unknown versions and v/map mismatches loudly', () => {
    expect(() => buildReplayInitial({ ...base, v: 3, map })).toThrow(/unknown version 3/)
    expect(() => buildReplayInitial({ ...base, v: REPLAY_VERSION })).toThrow(/requires an embedded map/)
    expect(() => buildReplayInitial({ ...base, map })).toThrow(/a map requires v: 2/)
    expect(() => buildReplayInitial({ ...base, v: REPLAY_VERSION, map: { w: 4, h: 3, flags: [1, 1] } })).toThrow(
      /flags\[w\*h\]/
    )
  })
})
