import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRuleBot } from '@rts/ai'
import {
  initialState,
  spawn,
  step,
  replay,
  hashState,
  fromInt,
  type State,
  type Command,
} from '@rts/sim'

function goldenCheck(file: string, h: number) {
  const path = resolve(`tests/gates/golden/${file}`)
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, String(h >>> 0))
  }
  expect(h >>> 0).toBe(Number(readFileSync(path, 'utf8').trim()))
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
  return o
}

// Two mirrored bases; player 0's starting scout is the deliberate asymmetry that keeps a
// bot-mirror match from stalling in perfect symmetry.
function matchWorld(): State {
  let s = initialState(42)
  s = spawn(s, 'depot', 0, fromInt(3), fromInt(3))
  s = spawn(s, 'minerals', -1, fromInt(6), fromInt(3))
  s = spawn(s, 'worker', 0, fromInt(4), fromInt(3))
  s = spawn(s, 'depot', 1, fromInt(28), fromInt(28))
  s = spawn(s, 'minerals', -1, fromInt(25), fromInt(28))
  s = spawn(s, 'worker', 1, fromInt(27), fromInt(28))
  return s
}

const MAX_TICKS = 600
const eliminated = (s: State, owner: number) => !s.entities.some((e) => e.owner === owner)

function runMatch(): { end: State; log: Command[][] } {
  const bots = [createRuleBot(), createRuleBot()]
  let s = matchWorld()
  const log: Command[][] = []
  while (s.tick < MAX_TICKS && !eliminated(s, 0) && !eliminated(s, 1)) {
    const cmds = [...bots[0].decide(s, 0), ...bots[1].decide(s, 1)]
    log.push(cmds)
    s = step(s, cmds)
  }
  return { end: s, log }
}

describe('Gate 4 — scripted AI player', () => {
  it('the AI decides via the shared command interface only (pure read of frozen state)', () => {
    const bot = createRuleBot()
    const s = matchWorld()
    const before = hashState(s)
    const cmds = bot.decide(deepFreeze(s), 0) // any mutation of frozen state throws in strict mode
    expect(Array.isArray(cmds)).toBe(true)
    expect(cmds.length).toBeGreaterThan(0)
    for (const c of cmds) {
      expect(['MOVE', 'ATTACK', 'BUILD', 'TRAIN', 'STOP', 'GATHER']).toContain(c.type)
      expect(c.playerId).toBe(0)
    }
    expect(hashState(s)).toBe(before) // observing the world did not change it
  })

  it('an AI-vs-AI match runs to a terminal state deterministically (golden end hash)', () => {
    const a = runMatch()
    const b = runMatch()
    expect(hashState(a.end)).toBe(hashState(b.end))
    expect(a.end.tick).toBeLessThan(MAX_TICKS) // terminal by elimination, not by the tick cap
    expect(eliminated(a.end, 0) || eliminated(a.end, 1)).toBe(true)
    goldenCheck('gate4.match.hash', hashState(a.end))
  })

  it('a replay of the recorded command log re-runs to the identical end-state hash', () => {
    const { end, log } = runMatch()
    expect(hashState(replay(matchWorld(), log))).toBe(hashState(end))
  })
})
