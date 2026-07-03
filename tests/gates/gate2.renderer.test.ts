import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { rightClickToMove, createProjection, interpolatePositions } from '@rts/render'
import { initialState, fromInt, type State } from '@rts/sim'

// The render/sim boundary is structural: render may import sim TYPES freely, but the only VALUES
// it may import are pure numeric converters for the read boundary (drawing) and the input/authoring
// boundary (building command payloads). Nothing that can reach or mutate sim state is importable,
// so "the renderer never writes to sim state" is enforced by the module graph, not by review.
const SIM_VALUE_ALLOWLIST = ['toFloat', 'fromFloat', 'fromInt', 'floorToInt', 'SCALE']

function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(dir, f))
}

describe('Gate 2 — dumb renderer + input->commands', () => {
  it('render imports from sim are types or allowlisted pure converters only', () => {
    for (const f of tsFilesUnder(resolve('packages/render/src'))) {
      const src = readFileSync(f, 'utf8')
      expect(src, `${f}: no namespace/default import of @rts/sim`).not.toMatch(
        /import\s+(?!type\b)(?!{)[^;]*from\s+['"]@rts\/sim['"]/
      )
      for (const m of src.matchAll(/import\s+(type\s+)?{([^}]*)}\s+from\s+['"]@rts\/sim['"]/g)) {
        if (m[1]) continue // `import type { ... }` — always fine
        const names = m[2]
          .split(',')
          .map((n) => n.trim())
          .filter((n) => n && !n.startsWith('type '))
          .map((n) => n.split(/\s+as\s+/)[0])
        for (const name of names) {
          expect(SIM_VALUE_ALLOWLIST, `${f}: value import "${name}" from @rts/sim`).toContain(name)
        }
      }
    }
  })

  it('a right-click maps to a well-formed MOVE command on the selected units', () => {
    const cmd = rightClickToMove([17, 18], 5, 9) as { type: string; unitIds: number[] }
    expect(cmd.type).toBe('MOVE')
    expect(cmd.unitIds).toEqual([17, 18])
  })

  it('projection is constructible (drives worldToScreen)', () => {
    expect(() => createProjection()).not.toThrow()
  })

  it('projection round-trips exactly (screenToWorld inverts worldToScreen)', () => {
    const p = createProjection()
    for (const [wx, wy] of [
      [0, 0],
      [5, 9],
      [12.5, 3.25],
      [-4, 7],
    ]) {
      const [sx, sy] = p.worldToScreen(wx, wy)
      const [rx, ry] = p.screenToWorld(sx, sy)
      expect(rx).toBeCloseTo(wx, 10)
      expect(ry).toBeCloseTo(wy, 10)
    }
  })

  it('interpolation places rendered positions between two sim states', () => {
    const base = initialState(1)
    const prev: State = {
      ...base,
      entities: [{ id: 1, type: 0, x: fromInt(2), y: fromInt(4), hp: 100 }],
    }
    const next: State = {
      ...base,
      tick: base.tick + 1,
      entities: [{ id: 1, type: 0, x: fromInt(3), y: fromInt(6), hp: 100 }],
    }
    const mid = interpolatePositions(prev, next, 0.5).get(1)!
    expect(mid.x).toBeCloseTo(2.5, 10)
    expect(mid.y).toBeCloseTo(5, 10)
    const at0 = interpolatePositions(prev, next, 0).get(1)!
    expect(at0.x).toBeCloseTo(2, 10)
    const at1 = interpolatePositions(prev, next, 1).get(1)!
    expect(at1.y).toBeCloseTo(6, 10)
  })

  it('the projection decision record exists and is ratified (not a proposal)', () => {
    const record = readFileSync(resolve('docs/decisions/projection.md'), 'utf8')
    expect(record, 'flip **Status:** to decided when ratifying').toMatch(/status[^a-z\n]*decided/i)
  })
})
