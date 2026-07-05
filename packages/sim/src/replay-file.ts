// Replay file format — enough to reconstruct a scenario from nothing: seed a world, apply the
// setup rows, then fold the recorded per-tick command log with replay(). Plain JSON in/out so
// files round-trip between the headless recorder (fs) and the browser viewer (fetch).
//
// Versioned deliberately (docs/decisions/maps-as-data.md): `v` absent = v1 = the default open
// 32×32 map — every pre-map file stays valid untouched. v2 embeds the runtime map INLINE: the
// map is hashed simulated state, so a by-name reference whose fixture later drifts would
// re-simulate a different world and silently diverge from every recorded hash. Unknown versions
// and v/map mismatches are refused loudly, never misread.
import type { State, WorldMap } from './types'
import type { Command } from './command-types'
import { initialState, spawn } from './index'
import { fromInt } from './fixed'

export interface ReplaySetupRow {
  type: string
  owner: number
  x: number // integer grid coords — converted to Fixed on load
  y: number
}

export const REPLAY_VERSION = 2

export interface ReplayFile {
  /** Absent = v1 (default open map). 2 = embedded map. Anything else is refused. */
  v?: number
  name: string
  seed: number
  /** v2 only: the runtime map, embedded so the file stays self-contained. */
  map?: WorldMap
  setup: ReplaySetupRow[]
  log: Command[][] // commands per tick, tick 0 first; empty arrays included
}

/** Validate the version/map pairing and return the world map to reconstruct against. */
function replayMap(file: ReplayFile): WorldMap | undefined {
  if (file.v === undefined) {
    if (file.map !== undefined) {
      throw new Error(`replay "${file.name}": carries a map but no version — a map requires v: ${REPLAY_VERSION}`)
    }
    return undefined // v1: the default open map
  }
  if (file.v !== REPLAY_VERSION) {
    throw new Error(`replay "${file.name}": unknown version ${file.v} (this build reads v1 (absent) and v: ${REPLAY_VERSION})`)
  }
  const m = file.map
  if (m === undefined) {
    throw new Error(`replay "${file.name}": v: ${REPLAY_VERSION} requires an embedded map`)
  }
  if (!Number.isInteger(m.w) || !Number.isInteger(m.h) || m.w <= 0 || m.h <= 0 || !Array.isArray(m.flags) || m.flags.length !== m.w * m.h) {
    throw new Error(`replay "${file.name}": embedded map must be { w, h, flags[w*h] }`)
  }
  return { w: m.w, h: m.h, flags: [...m.flags] }
}

/** Rebuild the initial world a replay was recorded against. */
export function buildReplayInitial(file: ReplayFile): State {
  const map = replayMap(file)
  let s = initialState(file.seed, undefined, map)
  for (const row of file.setup) s = spawn(s, row.type, row.owner, fromInt(row.x), fromInt(row.y))
  return s
}
