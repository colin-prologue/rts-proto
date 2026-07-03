// Named recordable scenarios. The gate4 match setup here MUST stay in lockstep with the world in
// tests/gates/gate4.ai.test.ts — the coupling is verified by hash: gate:6 asserts the recorded
// replay re-simulates to the committed gate4.match.hash, so any drift fails the gate visibly.
import { step, type State, type Command, type ReplayFile, type ReplaySetupRow } from '@rts/sim'
import { buildReplayInitial } from '@rts/sim'
import { createRuleBot } from '@rts/ai'

const GATE4_SETUP: ReplaySetupRow[] = [
  { type: 'depot', owner: 0, x: 3, y: 3 },
  { type: 'minerals', owner: -1, x: 6, y: 3 },
  { type: 'worker', owner: 0, x: 4, y: 3 },
  { type: 'depot', owner: 1, x: 28, y: 28 },
  { type: 'minerals', owner: -1, x: 25, y: 28 },
  { type: 'worker', owner: 1, x: 27, y: 28 },
]

const MAX_TICKS = 600
const eliminated = (s: State, owner: number) => !s.entities.some((e) => e.owner === owner)

/** Re-run the Gate 4 AI-vs-AI match, recording the command log as a replay file. */
export function recordGate4Match(): ReplayFile {
  const file: ReplayFile = { name: 'gate4-match', seed: 42, setup: GATE4_SETUP, log: [] }
  const bots = [createRuleBot(), createRuleBot()]
  let s = buildReplayInitial(file)
  while (s.tick < MAX_TICKS && !eliminated(s, 0) && !eliminated(s, 1)) {
    const cmds: Command[] = [...bots[0].decide(s, 0), ...bots[1].decide(s, 1)]
    file.log.push(cmds)
    s = step(s, cmds)
  }
  return file
}

export const SCENARIOS: Record<string, () => ReplayFile> = {
  gate4: recordGate4Match,
}
