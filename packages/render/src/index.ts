// Renderer READS sim state and interpolates between the last two ticks. It must NEVER mutate sim
// state (CONSTITUTION: sim/render split) — the gate lint holds this package to type imports and
// pure numeric converters from @rts/sim, nothing that can reach simulated state.
import type { State, Command, SimEvent, UnitSpec } from '@rts/sim'
import { toFloat, fromFloat } from '@rts/sim'

export interface RenderAdapter {
  /** Draw one frame by interpolating between two sim states at t in [0,1]. Read-only. */
  draw(prev: State, next: State, t: number): void
}

// Decision: docs/decisions/projection.md — dimetric 2:1, 64×32 tile, exactly invertible.
export const TILE_W = 64
export const TILE_H = 32

export interface Projection {
  worldToScreen(wx: number, wy: number): [number, number]
  screenToWorld(sx: number, sy: number): [number, number]
}

export function createProjection(): Projection {
  return {
    worldToScreen: (wx, wy) => [(wx - wy) * (TILE_W / 2), (wx + wy) * (TILE_H / 2)],
    screenToWorld: (sx, sy) => [sx / TILE_W + sy / TILE_H, sy / TILE_H - sx / TILE_W],
  }
}

/**
 * Map a right-click in world space to a MOVE command. Pure — testable without a canvas.
 * This is the ONLY thing a right-click does: the simulated effect waits for the command to be
 * consumed on its execute turn; the instant visual ack is a render-side flash, not a state change.
 */
export function rightClickToMove(
  unitIds: number[],
  worldX: number,
  worldY: number,
  playerId = 0,
  seq = 0
): Command {
  return {
    type: 'MOVE',
    playerId,
    seq,
    unitIds: [...unitIds],
    payload: { x: fromFloat(worldX), y: fromFloat(worldY) },
  }
}

/**
 * Render positions for a frame: each entity in `next` lerped from its position in `prev` at
 * t in [0,1]. Entities that just spawned (no prev) render at their next position. Pure floats —
 * the result is for drawing only and never feeds back into the sim.
 */
export function interpolatePositions(
  prev: State,
  next: State,
  t: number
): Map<number, { x: number; y: number }> {
  const prevById = new Map(prev.entities.map((e) => [e.id, e]))
  const out = new Map<number, { x: number; y: number }>()
  for (const e of next.entities) {
    const p = prevById.get(e.id) ?? e
    out.set(e.id, {
      x: toFloat(p.x) + (toFloat(e.x) - toFloat(p.x)) * t,
      y: toFloat(p.y) + (toFloat(e.y) - toFloat(p.y)) * t,
    })
  }
  return out
}

// ---- Replay-viewer view-models (Gate 6) — pure functions, testable without a canvas. ----------

export interface Flyby {
  target: number
  amount: number
  x: number // world coords of the hit — project + animate at draw time
  y: number
  ttl: number // 1 → fresh, 0 → expired; the draw loop decays it
}

/** One damage flyby per DAMAGE event, anchored at the target's (interpolated) world position. */
export function flybysFrom(
  events: SimEvent[],
  positions: Map<number, { x: number; y: number }>
): Flyby[] {
  const out: Flyby[] = []
  for (const ev of events) {
    if (ev.kind !== 'DAMAGE') continue
    const pos = positions.get(ev.target)
    if (!pos) continue // target already gone from the rendered state — nothing to anchor to
    out.push({ target: ev.target, amount: ev.amount, x: pos.x, y: pos.y, ttl: 1 })
  }
  return out
}

/** Hp-bar fill fraction, clamped to [0,1] (overkill damage and buffed hp both stay drawable). */
export function hpFraction(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0
  return Math.min(1, Math.max(0, hp / maxHp))
}

export interface QueuePips {
  count: number // queued items → one pip each
  headProgress: number // 0..1 completion of the item in production
}

// ---- Terrain view-model (Gate 8) — pure, testable without a canvas. -------------------------

export interface TerrainTile {
  x: number // tile grid coords (integer)
  y: number
  sx: number // projected screen anchor at the tile center
  sy: number
}

// Mirrors TILE_PASSABLE (bit 0) from @rts/sim types.ts — a const, so not on the value-import
// allowlist; the render side only ever reads the bit.
const PASSABLE_BIT = 1

/**
 * Draw entries for every impassable tile: the open floor is the background, walls are what a
 * viewer must see. Anchored at the tile center — a unit at continuous (x, y) occupies the tile
 * (floor(x), floor(y)), so the center is the visual mass of the blocked cell.
 */
export function terrainTiles(
  map: { w: number; h: number; flags: number[] },
  proj: Projection
): TerrainTile[] {
  const out: TerrainTile[] = []
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if ((map.flags[y * map.w + x] & PASSABLE_BIT) !== 0) continue
      const [sx, sy] = proj.worldToScreen(x + 0.5, y + 0.5)
      out.push({ x, y, sx, sy })
    }
  }
  return out
}

/** Production-queue badge model for a building. */
export function queuePips(
  queue: { unit: string; remaining: number }[] | undefined,
  specs: Record<string, UnitSpec>
): QueuePips {
  if (!queue || queue.length === 0) return { count: 0, headProgress: 0 }
  const head = queue[0]
  const total = specs[head.unit]?.buildTime ?? 0
  const progress = total > 0 ? Math.min(1, Math.max(0, 1 - head.remaining / total)) : 0
  return { count: queue.length, headProgress: progress }
}
