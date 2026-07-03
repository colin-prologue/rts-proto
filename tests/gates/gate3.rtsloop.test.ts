import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initialState, step, hashState, type Command } from '@rts/sim'

// Placeholder scenarios — the agent replaces the payloads with real economy/combat commands as the
// RTS loop and the data-driven unit/damage tables land. The point is that they run through step()
// deterministically and that combat outcome is a function of the (data) damage/armor table.
describe('Gate 3 — the RTS loop', () => {
  it('an economy + production + supply scenario resolves deterministically', () => {
    let s = initialState(99)
    const cmds: Command[] = [{ type: 'TRAIN', playerId: 0, seq: 0, unitIds: [], payload: {} }]
    s = step(s, cmds)
    const again = step(initialState(99), cmds)
    expect(hashState(s)).toBe(hashState(again))
  })

  it('combat outcome is driven by the damage/armor table (changing a value flips the winner)', () => {
    // Contract to satisfy: run comp A vs comp B, assert a fixed winner; mutate one table value,
    // assert the winner flips. Fails until the data-driven combat model exists.
    expect.fail('implement data-driven combat in Gate 3 (damage-type x armor-type table)')
  })

  it('the pathfinding decision record exists and is ratified (not a proposal)', () => {
    const record = readFileSync(resolve('docs/decisions/pathfinding.md'), 'utf8')
    expect(record, 'flip **Status:** to decided when ratifying').toMatch(/status[^a-z\n]*decided/i)
  })
})
