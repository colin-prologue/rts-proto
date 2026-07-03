// AI player emits the SAME commands as human input — no privileged state mutation (Gate 4).
import type { State, Command } from '@rts/sim'

export interface AIPlayer {
  /** Observe state, return commands for this player. The only way an AI touches the world. */
  decide(state: State, playerId: number): Command[]
}

export function createRuleBot(): AIPlayer {
  throw new Error('NotImplemented: rule-based bot (e.g. retreat+tech when out-armied) — Gate 4')
}
