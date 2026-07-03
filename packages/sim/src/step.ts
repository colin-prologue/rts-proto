import type { State, Entity } from './types'
import type { Command } from './command-types'
import { sortCommands } from './commands'
import { type Fixed, fromInt, add, sub, neg, cmp } from './fixed'

// Per-tick grid speed for every unit. Becomes per-unit-type data when the RTS loop lands (Gate 3).
const MOVE_SPEED = fromInt(1)

/** One axis of grid movement: advance `from` toward `to`, at most `speed` per tick. */
function stepToward(from: Fixed, to: Fixed, speed: Fixed): Fixed {
  const d = sub(to, from)
  if (cmp(d, neg(speed)) < 0) return sub(from, speed)
  if (cmp(d, speed) > 0) return add(from, speed)
  return to
}

// The pure reducer: state(n+1) = step(state(n), commands(n)).
// Commands are applied in sorted (playerId, seq) order, then every entity advances one tick in
// stable id order (the entities array is kept sorted by id). No I/O, no clock — any randomness
// must be drawn from state.rng and threaded back into the returned state (CONSTITUTION I–IV).
export function step(state: State, commands: Command[]): State {
  const entities: Entity[] = state.entities.map((e) => ({ ...e }))
  const byId = new Map(entities.map((e) => [e.id, e]))

  for (const c of sortCommands(commands)) {
    switch (c.type) {
      case 'MOVE': {
        const p = c.payload as { x: Fixed; y: Fixed }
        for (const id of c.unitIds) {
          const u = byId.get(id)
          if (u) u.target = { x: p.x, y: p.y }
        }
        break
      }
      case 'STOP': {
        for (const id of c.unitIds) {
          const u = byId.get(id)
          if (u) delete u.target
        }
        break
      }
      // ATTACK / BUILD / TRAIN land with the RTS loop (Gate 3); until then they are no-ops.
      default:
        break
    }
  }

  for (const e of entities) {
    if (!e.target) continue
    e.x = stepToward(e.x, e.target.x, MOVE_SPEED)
    e.y = stepToward(e.y, e.target.y, MOVE_SPEED)
    if (e.x === e.target.x && e.y === e.target.y) delete e.target
  }

  return { tick: state.tick + 1, rng: state.rng, entities }
}
