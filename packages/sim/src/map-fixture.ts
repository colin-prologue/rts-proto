// Maps are DATA (docs/decisions/maps-as-data.md): a fixture is ASCII tile rows plus two spawn
// anchors. This parser is pure JSON-shape → WorldMap — file I/O stays in apps and tests (the
// comp split), so packages/sim keeps zero Node dependencies. The rows are the *storage* format,
// chosen for PR diffability; hand-authoring them is bootstrap-only — the authoring surface is
// the web map editor (issue #11), a client of this exact format.
import type { WorldMap } from './types'
import { TILE_PASSABLE } from './types'

export interface MapSpawn {
  x: number
  y: number
}

export interface MapFixture {
  name: string
  /** Row-major tile rows, one string per row. Fixed legend: '.' passable, '#' impassable. */
  tiles: string[]
  /** Exactly two muster anchors, on passable tiles — consumed by the balance harness. */
  spawns: MapSpawn[]
}

export interface ParsedMap {
  name: string
  map: WorldMap
  spawns: [MapSpawn, MapSpawn]
}

// Map names flow into report labels and replay filenames — same safe token as comp names.
const MAP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const LEGEND: Record<string, number> = {
  '.': TILE_PASSABLE,
  '#': 0,
}

/** Parse a map fixture. Refuses malformed input loudly — never a silent misread. */
export function parseMap(fixture: MapFixture): ParsedMap {
  if (!fixture.name || !MAP_NAME.test(fixture.name)) {
    throw new Error(`map fixture: name "${fixture.name}" must match ${MAP_NAME} (it becomes a filename)`)
  }
  const rows = fixture.tiles
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`map "${fixture.name}": tiles must be a non-empty array of row strings`)
  }
  const h = rows.length
  const w = rows[0].length
  if (w === 0) throw new Error(`map "${fixture.name}": rows must be non-empty`)
  const flags = new Array<number>(w * h)
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) {
      throw new Error(`map "${fixture.name}": row ${y} has length ${rows[y].length}, expected ${w} (rectangular grid)`)
    }
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x]
      const f = LEGEND[ch]
      if (f === undefined) {
        throw new Error(`map "${fixture.name}": unknown tile "${ch}" at (${x}, ${y}) — legend is '.' passable, '#' impassable`)
      }
      flags[y * w + x] = f
    }
  }
  const spawns = fixture.spawns
  if (!Array.isArray(spawns) || spawns.length !== 2) {
    throw new Error(`map "${fixture.name}": spawns must be exactly two muster anchors`)
  }
  for (const [i, s] of spawns.entries()) {
    if (!Number.isInteger(s?.x) || !Number.isInteger(s?.y) || s.x < 0 || s.y < 0 || s.x >= w || s.y >= h) {
      throw new Error(`map "${fixture.name}": spawn ${i} must be integer coords inside ${w}x${h}`)
    }
    if ((flags[s.y * w + s.x] & TILE_PASSABLE) === 0) {
      throw new Error(`map "${fixture.name}": spawn ${i} at (${s.x}, ${s.y}) sits on an impassable tile`)
    }
  }
  return { name: fixture.name, map: { w, h, flags }, spawns: [spawns[0], spawns[1]] }
}

/**
 * Nearest passable tile to (x, y): the point is clamped into bounds, then Chebyshev rings grow
 * outward, scanned in fixed row-major order — deterministic, the same tile for the same map
 * forever. Throws (loudly) if the map has no passable tile at all. Used wherever a fixed or
 * jittered position must land on ground a unit can legally occupy (the harness formation
 * spill, the default scout on custom maps).
 */
export function nearestPassable(map: WorldMap, x: number, y: number): { x: number; y: number } {
  const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, v))
  x = clamp(x, map.w - 1)
  y = clamp(y, map.h - 1)
  const passable = (px: number, py: number) => (map.flags[py * map.w + px] & TILE_PASSABLE) !== 0
  if (passable(x, y)) return { x, y }
  for (let r = 1; r < Math.max(map.w, map.h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue // ring cells only
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue
        if (passable(nx, ny)) return { x: nx, y: ny }
      }
    }
  }
  throw new Error('nearestPassable: the map has no passable tile')
}
