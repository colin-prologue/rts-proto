// Named recordable scenarios. The gate4 match setup here MUST stay in lockstep with the world in
// tests/gates/gate4.ai.test.ts — the coupling is verified by hash: gate:6 asserts the recorded
// replay re-simulates to the committed gate4.match.hash, so any drift fails the gate visibly.
// The gate9 army scenario likewise mirrors tests/gates/gate9.movement.test.ts (seed, spawns,
// order) so what the viewer shows is the world the gate9.army.hash golden pins.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { step, parseMap, floorToInt, fromInt, REPLAY_VERSION } from '@rts/sim'
import type { State, Command, ReplayFile, ReplaySetupRow, MapFixture } from '@rts/sim'
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

/**
 * The Gate 9 human-review scenario: 40 grunts cross the choke-corridor gap (the gate9.army
 * contract, byte-for-byte — seed 52, the same 5×8 spawn block, one MOVE to (26, 16)). The log
 * is one command tick plus empty ticks until every grunt has come to rest, so the viewer plays
 * exactly the march and stops.
 */
export function recordGate9Army(): ReplayFile {
  const fixture = JSON.parse(
    readFileSync(resolve('tests/gates/fixtures/maps/choke-corridor.json'), 'utf8')
  ) as MapFixture
  const choke = parseMap(fixture)
  const setup: ReplaySetupRow[] = []
  for (let y = 12; y < 20; y++) {
    for (let x = 3; x < 8; x++) setup.push({ type: 'grunt', owner: 0, x, y })
  }
  const file: ReplayFile = {
    v: REPLAY_VERSION,
    name: 'gate9-army-choke-crossing',
    seed: 52,
    map: { ...choke.map, flags: [...choke.map.flags] },
    setup,
    log: [],
  }
  let s = buildReplayInitial(file)
  const ids = s.entities.filter((e) => e.type === 'grunt').map((e) => e.id)
  const order: Command = {
    type: 'MOVE',
    playerId: 0,
    seq: 0,
    unitIds: ids,
    payload: { x: fromInt(26), y: fromInt(16) },
  }
  const marching = () => s.entities.some((e) => e.type === 'grunt' && e.target !== undefined)
  for (let i = 0; i < 300; i++) {
    const cmds: Command[] = s.tick === 0 ? [order] : []
    file.log.push(cmds)
    s = step(s, cmds)
    if (s.tick > 1 && !marching()) break // everyone has arrived or packed — end of the show
  }
  const across = ids.filter((id) => {
    const e = s.entities.find((x) => x.id === id)!
    return floorToInt(e.x) > 16
  }).length
  console.log(`gate9-army: ${across}/${ids.length} across the wall band after ${s.tick} ticks`)
  return file
}

export const SCENARIOS: Record<string, () => ReplayFile> = {
  gate4: recordGate4Match,
  'gate9-army': recordGate9Army,
}
