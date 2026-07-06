// Flow-field pathfinding (docs/decisions/pathfinding.md): one integer cost field per
// destination, every unit in the group reads its cell. Costs are Chebyshev-uniform (a diagonal
// step costs the same 1 as a cardinal one) because that is the sim's movement metric —
// stepToward advances both axes at full speed. All field math is plain integers; no floats,
// no RNG, no clock (CONSTITUTION II, III, VI).
//
// The field is DERIVED data — a pure function of (map, destination) — so it lives outside
// hashed state and is recomputed on demand. A Pathfinder instance is created per step() call
// and memoizes fields per destination for that tick; step() never stores one in State.

import type { WorldMap } from './types'
import { TILE_PASSABLE } from './types'

/** Cost marker for tiles with no path to the destination. */
export const UNREACHABLE = 0x7fffffff

export interface FlowField {
  /** Integer cost-to-destination of tile (x, y); UNREACHABLE if no path, out of bounds, or wall. */
  costAt(x: number, y: number): number
}

/** The interface promised by the pathfinding record — unit logic never sees the generator. */
export interface Pathfinder {
  fieldTo(destX: number, destY: number): FlowField
}

export const passableTile = (map: WorldMap, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < map.w && y < map.h && (map.flags[y * map.w + x] & TILE_PASSABLE) !== 0

// Fixed neighbor scan order — part of the determinism contract (CONSTITUTION IV): every peer
// expands and ties-breaks identically.
const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
]

/**
 * A diagonal step must not cut a corner: both adjacent cardinals have to be passable, or the
 * move (and the field edge — they must mirror each other) is refused.
 */
export const diagonalOk = (map: WorldMap, x: number, y: number, dx: number, dy: number): boolean =>
  dx === 0 || dy === 0 || (passableTile(map, x + dx, y) && passableTile(map, x, y + dy))

/** Breadth-first flood from the destination; uniform edge cost 1 over 8-connected tiles. */
function computeField(map: WorldMap, destX: number, destY: number): Int32Array {
  const { w, h } = map
  const cost = new Int32Array(w * h).fill(UNREACHABLE)
  const queue = new Int32Array(w * h)
  let head = 0
  let tail = 0
  cost[destY * w + destX] = 0
  queue[tail++] = destY * w + destX
  while (head < tail) {
    const cur = queue[head++]
    const cx = cur % w
    const cy = (cur - cx) / w
    const next = cost[cur] + 1
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx
      const ny = cy + dy
      if (!passableTile(map, nx, ny)) continue
      if (!diagonalOk(map, cx, cy, dx, dy)) continue
      const n = ny * w + nx
      if (cost[n] <= next) continue
      cost[n] = next
      queue[tail++] = n
    }
  }
  return cost
}

// An open map (no walls) needs no flood at all: the Chebyshev distance IS the exact cost.
// This keeps the default 32×32 arena — the bulk of every balance run — allocation-free.
const openness = new WeakMap<WorldMap, boolean>()
function isOpen(map: WorldMap): boolean {
  let open = openness.get(map)
  if (open === undefined) {
    open = map.flags.every((f) => (f & TILE_PASSABLE) !== 0)
    openness.set(map, open)
  }
  return open
}

export function createPathfinder(map: WorldMap): Pathfinder {
  const fields = new Map<number, FlowField>()
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < map.w && y < map.h
  return {
    fieldTo(destX, destY) {
      const key = destY * map.w + destX
      let f = fields.get(key)
      if (!f) {
        if (isOpen(map)) {
          f = {
            costAt: (x, y) =>
              inBounds(x, y) ? Math.max(Math.abs(x - destX), Math.abs(y - destY)) : UNREACHABLE,
          }
        } else {
          const cost = computeField(map, destX, destY)
          f = { costAt: (x, y) => (inBounds(x, y) ? cost[y * map.w + x] : UNREACHABLE) }
        }
        fields.set(key, f)
      }
      return f
    },
  }
}

/**
 * The best next tile for a mover at (x, y) following `field` toward (destX, destY), skipping
 * tiles vetoed by `blocked` (occupancy — docs/decisions/unit-collision.md). Only strictly
 * cost-decreasing tiles are candidates, so following the field always makes progress and can
 * never oscillate. Ties break toward the straighter line (smaller squared tile distance to the
 * destination), then by the fixed scan order.
 *
 * Returns the chosen tile, or null with the reason movement stalled:
 * 'blocked-movers' — at least one candidate is held by an entity still trying to move (a queue:
 * wait); 'blocked-stationary' — every candidate is held by something that is not going anywhere
 * (arrival relaxation: the order is as complete as it can get); 'none' — no strictly better
 * tile exists (only possible on/at the destination or an unreachable field).
 */
export function nextTile(
  map: WorldMap,
  field: FlowField,
  x: number,
  y: number,
  destX: number,
  destY: number,
  blocked: (tile: number) => 'free' | 'mover' | 'stationary'
): { tile: number | null; stall: 'blocked-movers' | 'blocked-stationary' | 'none' } {
  const cur = field.costAt(x, y)
  let best = -1
  let bestCost = 0
  let bestD2 = 0
  let sawMover = false
  let sawStationary = false
  for (const [dx, dy] of NEIGHBORS) {
    const nx = x + dx
    const ny = y + dy
    if (!passableTile(map, nx, ny)) continue
    if (!diagonalOk(map, x, y, dx, dy)) continue
    const c = field.costAt(nx, ny)
    if (c >= cur) continue
    const state = blocked(ny * map.w + nx)
    if (state !== 'free') {
      if (state === 'mover') sawMover = true
      else sawStationary = true
      continue
    }
    const ex = nx - destX
    const ey = ny - destY
    const d2 = ex * ex + ey * ey
    if (best === -1 || c < bestCost || (c === bestCost && d2 < bestD2)) {
      best = ny * map.w + nx
      bestCost = c
      bestD2 = d2
    }
  }
  if (best !== -1) return { tile: best, stall: 'none' }
  if (sawMover) return { tile: null, stall: 'blocked-movers' }
  if (sawStationary) return { tile: null, stall: 'blocked-stationary' }
  return { tile: null, stall: 'none' }
}
