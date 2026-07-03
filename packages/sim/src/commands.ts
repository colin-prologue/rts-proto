import type { Command } from './command-types'
export type { Command, CommandType } from './command-types'

// Commands for a tick are applied sorted by (playerId, seq) so the order is identical on every
// peer before step() runs (CONSTITUTION IV). Never rely on arrival order.
export function sortCommands(cmds: Command[]): Command[] {
  return [...cmds].sort((a, b) => a.playerId - b.playerId || a.seq - b.seq)
}
