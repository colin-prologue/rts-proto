export type CommandType = 'MOVE' | 'ATTACK' | 'BUILD' | 'TRAIN' | 'STOP'

export interface Command {
  type: CommandType
  playerId: number
  seq: number
  unitIds: number[]
  payload?: unknown
}
