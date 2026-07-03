# Decision: pathfinding — flow fields (proposed)

**Status:** proposed — ratify or replace before Gate 3.

## Recommendation
**Flow fields** for moving groups: compute one field toward a destination, every unit reads its cell.
Scales cleanly with army size and avoids the per-unit A* thrash that makes large selections judder.

## Alternatives
- **Per-unit A*:** fine for a handful of units, degrades badly for group moves; the classic RTS pain.
- **Hierarchical A* / portals:** strong for big static maps, more machinery than a prototype warrants.

Grid + terrain flags (passable, high/low ground, choke) are shared by any choice. Keep the pathfinder
behind an interface so it can be swapped without touching unit logic.
