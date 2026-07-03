import { describe, it, expect } from 'vitest'
import { createRuleBot } from '@rts/ai'
import { initialState } from '@rts/sim'

describe('Gate 4 — scripted AI player', () => {
  it('the AI decides via the shared command interface only', () => {
    const bot = createRuleBot()
    const cmds = bot.decide(initialState(1), 0)
    expect(Array.isArray(cmds)).toBe(true)
  })

  it('an AI-vs-AI match runs to a terminal state deterministically', () => {
    // Contract: drive two rule bots through step() to a terminal state; assert a golden end hash,
    // and assert a replay of the command log reproduces it. Fails until the bot + loop exist.
    expect.fail('implement the AI match + replay check in Gate 4')
  })
})
