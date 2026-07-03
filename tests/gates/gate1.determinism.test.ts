import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import {
  initialState,
  step,
  hashState,
  rngU32,
  fromInt,
  type Command,
  type State,
} from '@rts/sim'

// A small, fixed scripted scenario. Deterministic input for a deterministic sim.
function scenario(): Command[][] {
  const move = (seq: number): Command => ({
    type: 'MOVE',
    playerId: 0,
    seq,
    unitIds: [1],
    payload: { x: fromInt(5), y: fromInt(5) },
  })
  return [[move(0)], [], [move(1)], [], []] // commands per tick
}

function run(): State {
  let s = initialState(1234)
  for (const cmds of scenario()) s = step(s, cmds)
  return s
}

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(dir, f))
}

const GOLDEN = resolve('tests/gates/golden/gate1.hash')

describe('Gate 1 — deterministic sim core', () => {
  // --- guards that already hold at baseline (prove the anchors have teeth) ---

  it('sim source contains no banned nondeterminism', () => {
    const banned = /Math\.random|Date\.now|performance\.now|new Date\(/
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    for (const f of tsFilesUnder(resolve('packages/sim/src'))) {
      const code = stripComments(readFileSync(f, 'utf8'))
      expect(code, `${f} uses banned nondeterminism`).not.toMatch(banned)
    }
  })

  it('the state hash includes rng state (out-of-band draws would diverge it)', () => {
    const a = initialState(7)
    expect(hashState({ ...a, rng: a.rng + 1 })).not.toBe(hashState(a))
  })

  it('a numeric-model decision record exists', () => {
    const decisions = readdirSync(resolve('docs/decisions'))
    expect(decisions.some((f) => /numeric/i.test(f))).toBe(true)
  })

  // --- the real behavioral gate: fails until step() is implemented ---

  it('same seed + same command log produces identical end-state hashes across two runs', () => {
    const h1 = hashState(run())
    const h2 = hashState(run())
    expect(h1).toBe(h2)
  })

  it('an injected out-of-band rng draw diverges the end state (the guard has teeth)', () => {
    const clean = hashState(run())
    let s = initialState(1234)
    const ticks = scenario()
    for (let i = 0; i < ticks.length; i++) {
      if (i === 2) {
        const [, next] = rngU32(s.rng) // a consumer drawing outside the sim's fixed order
        s = { ...s, rng: next }
      }
      s = step(s, ticks[i])
    }
    expect(hashState(s)).not.toBe(clean)
  })

  it('end-state hash matches the committed golden (records it on first green run)', () => {
    const h = hashState(run())
    if (!existsSync(GOLDEN)) {
      mkdirSync(dirname(GOLDEN), { recursive: true })
      writeFileSync(GOLDEN, String(h >>> 0))
      // Recorded — commit tests/gates/golden/gate1.hash so other environments are pinned to it.
    }
    expect(h >>> 0).toBe(Number(readFileSync(GOLDEN, 'utf8').trim()))
  })
})
