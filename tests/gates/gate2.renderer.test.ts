import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  rightClickToMove,
  createProjection,
  interpolatePositions,
  mapScreenBounds,
  fitCamera,
  zoomAboutPoint,
  cameraScreenToWorld,
} from '@rts/render'
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
      entities: [{ id: 1, type: 'scout', owner: 0, x: fromInt(2), y: fromInt(4), hp: 100 }],
    }
    const next: State = {
      ...base,
      tick: base.tick + 1,
      entities: [{ id: 1, type: 'scout', owner: 0, x: fromInt(3), y: fromInt(6), hp: 100 }],
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

// #13 — the camera is render-side pure math; these assertions pin the parts a browser can't.
describe('Gate 2 addendum — camera view-model (#13)', () => {
  const proj = createProjection()

  it('fit-bounds frames the whole map inside the viewport, centered', () => {
    const bounds = mapScreenBounds({ w: 32, h: 32 }, proj)
    const cam = fitCamera(bounds, 800, 600, 48)
    expect(cam.scale).toBeGreaterThan(0)
    // every bound corner lands inside the padded viewport
    for (const [bx, by] of [
      [bounds.minX, bounds.minY],
      [bounds.maxX, bounds.maxY],
    ]) {
      const sx = bx * cam.scale + cam.x
      const sy = by * cam.scale + cam.y
      expect(sx).toBeGreaterThanOrEqual(48 - 1e-9)
      expect(sx).toBeLessThanOrEqual(800 - 48 + 1e-9)
      expect(sy).toBeGreaterThanOrEqual(48 - 1e-9)
      expect(sy).toBeLessThanOrEqual(600 - 48 + 1e-9)
    }
    // centered: equal slack left/right and top/bottom
    const cx = ((bounds.minX + bounds.maxX) / 2) * cam.scale + cam.x
    const cy = ((bounds.minY + bounds.maxY) / 2) * cam.scale + cam.y
    expect(cx).toBeCloseTo(400, 9)
    expect(cy).toBeCloseTo(300, 9)
  })

  it('fit-bounds survives a degenerate (zero-size) viewport without a zero/Infinity scale', () => {
    const cam = fitCamera(mapScreenBounds({ w: 32, h: 32 }, proj), 0, 0, 48)
    expect(Number.isFinite(cam.scale)).toBe(true)
    expect(cam.scale).toBeGreaterThan(0)
  })

  it('zoom-about-point keeps the world point under the cursor fixed', () => {
    const cam = { x: 130, y: 70, scale: 1 }
    const [cursorX, cursorY] = [412, 288]
    const before = cameraScreenToWorld(cam, proj, cursorX, cursorY)
    const zoomed = zoomAboutPoint(cam, cursorX, cursorY, 1.5, 0.2, 4)
    const after = cameraScreenToWorld(zoomed, proj, cursorX, cursorY)
    expect(zoomed.scale).toBeCloseTo(1.5, 10)
    expect(after[0]).toBeCloseTo(before[0], 9)
    expect(after[1]).toBeCloseTo(before[1], 9)
  })

  it('zoom-about-point clamps scale without drifting the anchor', () => {
    const cam = { x: -40, y: 25, scale: 3.9 }
    const before = cameraScreenToWorld(cam, proj, 200, 150)
    const zoomed = zoomAboutPoint(cam, 200, 150, 100, 0.2, 4)
    expect(zoomed.scale).toBe(4)
    const after = cameraScreenToWorld(zoomed, proj, 200, 150)
    expect(after[0]).toBeCloseTo(before[0], 9)
    expect(after[1]).toBeCloseTo(before[1], 9)
  })

  it('screen→world through the camera inverts worldToScreen + camera transform', () => {
    const cam = { x: 250, y: -60, scale: 1.75 }
    for (const [wx, wy] of [
      [0, 0],
      [5, 9],
      [12.5, 3.25],
    ]) {
      const [px, py] = proj.worldToScreen(wx, wy)
      const [sx, sy] = [px * cam.scale + cam.x, py * cam.scale + cam.y]
      const [rx, ry] = cameraScreenToWorld(cam, proj, sx, sy)
      expect(rx).toBeCloseTo(wx, 9)
      expect(ry).toBeCloseTo(wy, 9)
    }
  })
})
