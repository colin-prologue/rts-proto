import type { State } from './types'
import type { Command } from './command-types'
import { sortCommands } from './commands'

export const NOT_IMPLEMENTED = 'NotImplemented'

// The pure reducer: state(n+1) = step(state(n), commands(n)).
// STUB — the agent implements this in Gate 1. It must:
//   1. sort commands via sortCommands (already wired below for reference),
//   2. apply them and advance simulated state by exactly one tick,
//   3. draw any randomness from state.rng (threaded, never Math.random),
//   4. read no wall-clock, mutate nothing outside the returned state,
//   5. return a NEW state with tick + 1.
// See CONSTITUTION I–IV and docs/build-plan.md Gate 1.
export function step(state: State, commands: Command[]): State {
  const _ordered = sortCommands(commands) // ordering contract lives here; apply _ordered when implementing
  void _ordered
  void state
  throw new Error(
    `${NOT_IMPLEMENTED}: step() must apply sorted commands and advance one tick deterministically — see docs/build-plan.md Gate 1`
  )
}
