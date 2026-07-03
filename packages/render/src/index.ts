// Renderer READS sim state and interpolates between the last two ticks. It must NEVER mutate sim
// state (CONSTITUTION: sim/render split) — the gate lint holds this package to type imports and
// pure numeric converters from @rts/sim, nothing that can reach simulated state.
import type { State, Command } from '@rts/sim'
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
