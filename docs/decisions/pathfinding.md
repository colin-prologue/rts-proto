# Decision: pathfinding — flow fields

**Status:** decided (ratified for Gate 3). Revisit only with a replacement record.

## Choice

**Flow fields** for moving groups: compute one field toward a destination, every unit in the group
reads its cell. Scales cleanly with army size and avoids the per-unit A* thrash that makes large
selections judder — and "how does a 40-unit army feel to move" is exactly the kind of design
question this prototype exists to answer cheaply.

## Implementation state (honest scope)

The *substrate* ships with Gate 3: tile grid with terrain flags (`TILE_PASSABLE` bit consumed by
movement — impassable tiles stop a mover), and straight-line per-unit stepping as the placeholder
mover. The flow-field generator itself lands with the first group-movement work, behind a
pathfinder interface so swapping it in never touches unit logic. All field math must be integer
(cost values, not float gradients) to stay inside the determinism laws.

## Rejected

- **Per-unit A*:** fine for a handful of units, degrades badly for group moves; the classic RTS
  pain this genre spent a decade fighting.
- **Hierarchical A* / portals:** strong for big static maps, more machinery than a prototype
  warrants; adopt only if maps grow past what one field per move order handles.
