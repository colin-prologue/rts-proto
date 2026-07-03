# Decision: projection — dimetric 2:1 (proposed)

**Status:** proposed — ratify or replace before Gate 2.

## Recommendation
**Dimetric 2:1** (~26.57°), the classic StarCraft look: tiles are twice as wide as tall, screen math
is cheap integer ratios, and sprite art reads as the era intends.

## Alternatives
- **True isometric (30°):** more "correct" angles, but non-integer tile math and a less nostalgic feel.
- **3D under a fixed ortho camera:** real depth and camera freedom, but pulls in a 3D pipeline and art
  budget the prototype does not need yet.

Whatever is chosen drives `worldToScreen`/`screenToWorld` and all input mapping. Record the pick and
implement `createProjection()` accordingly.
