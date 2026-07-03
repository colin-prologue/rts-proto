# Decision: projection — dimetric 2:1

**Status:** decided (ratified for Gate 2, implemented in `packages/render`). Revisit only with a
replacement record.

## Choice

**Dimetric 2:1** (~26.57°), the classic Command & Conquer / StarCraft look, with a 64×32 px tile.
`worldToScreen` / `screenToWorld` are exact integer-ratio affine maps:

```
screenX = (wx - wy) * TILE_W/2        wx = sx/TILE_W + sy/TILE_H
screenY = (wx + wy) * TILE_H/2        wy = sy/TILE_H - sx/TILE_W
```

## Why

- **Exactly invertible, no trig.** Input mapping (click → world) is the projection run backward with
  cheap ratios — no accumulated float error deciding which tile a right-click lands on, and no
  transcendentals anywhere near the input path that feeds commands into the deterministic sim.
- **Reads as the era intends.** 2:1 is what the reference games shipped; sprite art authored for it
  is abundant, and the nostalgic feel is a design goal of this prototype, not an accident.
- **Keeps the renderer a pure consumer.** The projection is a pair of pure functions over floats at
  the render boundary — no camera matrix stack, no 3D state to leak back toward the sim.

## Rejected

- **True isometric (30°):** more "correct" angles, but non-integer tile ratios make both the art
  grid and the inverse mapping messier, for a feel this prototype doesn't want anyway.
- **3D under a fixed ortho camera:** real depth and camera freedom, but pulls in a 3D pipeline and
  an art budget the prototype does not need; the whole point is cheap experiments on flat sprites.
