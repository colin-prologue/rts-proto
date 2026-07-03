// Renderer READS sim state and interpolates between the last two ticks. It must NEVER mutate sim
// state (CONSTITUTION: sim/render split). Projection + input->command mapping land in Gate 2.
import type { State } from '@rts/sim'
import type { Command } from '@rts/sim'

export interface RenderAdapter {
  /** Draw one frame by interpolating between two sim states at t in [0,1]. Read-only. */
  draw(prev: State, next: State, t: number): void
}

export interface Projection {
  worldToScreen(x: number, y: number): [number, number]
}

// Decision: docs/decisions/projection.md
export function createProjection(): Projection {
  throw new Error('NotImplemented: projection — see docs/decisions/projection.md, Gate 2')
}

/** Map a right-click in world space to a MOVE command. Pure — testable without a canvas. */
export function rightClickToMove(unitIds: number[], worldX: number, worldY: number): Command {
  void unitIds; void worldX; void worldY
  throw new Error('NotImplemented: build a MOVE command from a right-click — Gate 2')
}
