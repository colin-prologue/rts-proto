// Replay file format — enough to reconstruct a scenario from nothing: seed a world, apply the
// setup rows, then fold the recorded per-tick command log with replay(). Plain JSON in/out so
// files round-trip between the headless recorder (fs) and the browser viewer (fetch).
import type { State } from './types'
import type { Command } from './command-types'
import { initialState, spawn } from './index'
import { fromInt } from './fixed'

export interface ReplaySetupRow {
  type: string
  owner: number
  x: number // integer grid coords — converted to Fixed on load
  y: number
}

export interface ReplayFile {
  name: string
  seed: number
  setup: ReplaySetupRow[]
  log: Command[][] // commands per tick, tick 0 first; empty arrays included
}

/** Rebuild the initial world a replay was recorded against. */
export function buildReplayInitial(file: ReplayFile): State {
  let s = initialState(file.seed)
  for (const row of file.setup) s = spawn(s, row.type, row.owner, fromInt(row.x), fromInt(row.y))
  return s
}
