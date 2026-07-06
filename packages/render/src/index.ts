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

// ---- Camera (#13) — a transform on the world container, render-side only. --------------------
// The sim never sees the camera: these are pure screen-space helpers, testable without a canvas.

/** World-container transform: translation in screen px plus uniform scale. */
export interface Camera {
  x: number
  y: number
  scale: number
}

export interface ScreenBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Screen-space bounding box of a w×h tile map. A tile's diamond is exactly the projection of its
 * unit world square, so projecting the four corners of the world rectangle [0,w]×[0,h] bounds
 * every tile with no per-tile pass.
 */
export function mapScreenBounds(map: { w: number; h: number }, proj: Projection): ScreenBounds {
  const corners: [number, number][] = [
    proj.worldToScreen(0, 0),
    proj.worldToScreen(map.w, 0),
    proj.worldToScreen(0, map.h),
    proj.worldToScreen(map.w, map.h),
  ]
  return {
    minX: Math.min(...corners.map(([x]) => x)),
    minY: Math.min(...corners.map(([, y]) => y)),
    maxX: Math.max(...corners.map(([x]) => x)),
    maxY: Math.max(...corners.map(([, y]) => y)),
  }
}

/**
 * Frame the whole bounds inside the viewport: largest uniform scale that fits (never upscaled
 * past 1 — pixel art reads worst zoomed in by default), centered both axes. Degenerate viewports
 * (zero-width tab at load) fall back to scale 1 rather than 0/Infinity.
 */
export function fitCamera(
  bounds: ScreenBounds,
  viewportW: number,
  viewportH: number,
  padding = 0
): Camera {
  const bw = bounds.maxX - bounds.minX
  const bh = bounds.maxY - bounds.minY
  const availW = viewportW - 2 * padding
  const availH = viewportH - 2 * padding
  const scale =
    bw > 0 && bh > 0 && availW > 0 && availH > 0 ? Math.min(availW / bw, availH / bh, 1) : 1
  return {
    x: (viewportW - (bounds.minX + bounds.maxX) * scale) / 2,
    y: (viewportH - (bounds.minY + bounds.maxY) * scale) / 2,
    scale,
  }
}

/**
 * Zoom by `factor` keeping the world point under the screen position (sx, sy) fixed — the classic
 * wheel-zoom-about-cursor. Scale is clamped to [minScale, maxScale]; the translation is derived
 * from the *clamped* scale so hitting the limit never drifts the anchor.
 */
export function zoomAboutPoint(
  cam: Camera,
  sx: number,
  sy: number,
  factor: number,
  minScale: number,
  maxScale: number
): Camera {
  const scale = Math.min(maxScale, Math.max(minScale, cam.scale * factor))
  const k = scale / cam.scale
  return { x: sx - (sx - cam.x) * k, y: sy - (sy - cam.y) * k, scale }
}

/** Invert the camera transform, then the projection: screen px (e.g. a click) → world coords. */
export function cameraScreenToWorld(
  cam: Camera,
  proj: Projection,
  sx: number,
  sy: number
): [number, number] {
  return proj.screenToWorld((sx - cam.x) / cam.scale, (sy - cam.y) / cam.scale)
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
