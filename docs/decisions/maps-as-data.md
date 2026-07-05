# Decision: maps as data — fixtures, replay versioning, and the high-ground line

**Status:** decided (ratified 2026-07-05 at the start of the Gate 8 run, after maintainer review
of the authoring story: the ASCII rows survive as the *storage* format only — diffable, purely
parseable — with hand-authoring bootstrap-only and the web map editor (issue #11) as the
authoring surface; the image-authoring alternative was weighed and is recorded below). Revisit
only with a replacement record.

## Problem

The prototype's charter names three design questions; *does this map play fair* is the third and
has no surface — every scenario runs on the featureless open 32×32 grid `initialState` builds.
The substrate already exists: `WorldMap` is a flag grid, movement consumes `TILE_PASSABLE`, and
the map is **hashed simulated state** (unlike `state.data`, which is unhashed config). Three
forks decide the gate: how maps enter as content, how replays carry the map, and whether high
ground ships now.

## Choice

**1. Maps are data fixtures, parsed pure.** The JSON below is the **storage format**, chosen
for PR diffability (one tile row per line — a map change reads as changed rows) and a pure
parse — it is *not* the intended authoring surface. Hand-editing these rows is bootstrap-only,
to unblock Gate 8 development, and goes away as soon as the web map editor (issue #11) is
online: the editor reads and writes this exact format, so the fixture stays the single source
of truth and the editor is a client of it, never a second format. A map is a JSON file:

```json
{
  "name": "choke-corridor",
  "tiles": ["........", "..####..", "........"],
  "spawns": [{ "x": 2, "y": 2 }, { "x": 27, "y": 29 }]
}
```

- Fixed legend, one bit today: `.` passable, `#` impassable. New flags (high ground, buildable)
  extend the legend under their own future records; the format does not break.
- `name` is constrained to the same safe token as comp names (it flows into report labels and
  filenames).
- `spawns` is exactly two muster anchors, consumed by the balance harness in place of its
  hardcoded `ANCHORS` when a map is given. The sim itself never reads spawns.
- The parser (`parseMap`: fixture JSON → `WorldMap` + spawns) is a **pure function in
  `packages/sim`** — no fs, same split as comps: parsing lives beside the type it produces,
  file I/O stays in apps and tests. `initialState` gains an optional map argument defaulting to
  the open 32×32, so the no-map path is byte-identical and no committed golden moves.

**2. Replays version explicitly and embed the map inline.**

- `v` absent = **v1**: the default open map, exactly the files that exist today — the committed
  `gate4-match.json` stays valid and untouched.
- `v: 2` **requires** an embedded `map: { w, h, flags }` (the runtime form, not the authoring
  fixture). The loader refuses an unknown version, a map without `v: 2`, and a `v: 2` without a
  map — loudly, never a silent misread.
- Why embed rather than reference by name: `ReplayFile`'s charter is *reconstruct a scenario
  from nothing*, and the map is hashed state — a by-name reference whose fixture later drifts
  re-simulates a **different world** and diverges from every recorded hash. That is exactly the
  failure mode the `exportRun` data-override refusal exists to prevent, and the fix is the same
  house pattern (out-array, `Fixed` newtype, import allowlist): make the divergence structurally
  impossible instead of policing it with a convention.

**3. High ground is deferred to its own record.** Terrain that changes *combat* (the era prior
art is BW's 136/256 uphill hit chance, already written up in `balance-sampling.md`) is a
game-design decision that moves goldens — not map plumbing. The balance-sampling record already
draws this line: design changes ride their own record with deliberately re-recorded goldens.
Gate 8 ships **passability terrain only** (chokes, walls, arenas). Movement already consumes
`TILE_PASSABLE`, so `step()` is untouched by this gate.

## Rejected

- **Image authoring (fixed-palette PNG painted in GIMP or similar):** seriously considered —
  painting beats text-editing for layout, and layers tempt as metadata carriers. Rejected
  because it trades text diffs for binary blobs and imports a real determinism hazard class:
  browser canvas decode is color-managed and not byte-reliable across browsers, editors
  anti-alias off-palette pixels, and Node would grow a decoder dependency. The want behind it
  (a visual authoring surface with symmetry tooling) is met by the web map editor (issue #11)
  over this same diffable text format instead.
- **Map by fixture-name reference in replays:** name-to-content drift silently changes the
  reconstructed world; the viewer would need the fixture tree at hand; replays stop being
  self-contained artifacts.
- **Optional map field with no version field:** works mechanically, but the semantics are
  silent — a future reader cannot tell a pre-map file from a post-map default-arena file by
  intent. Issue #3's instruction is to version the format *deliberately*; refusal of the
  unknown must be loud.
- **Per-fixture tile legends:** one flag bit exists today; a configurable legend is machinery
  ahead of need. Extend the fixed legend when a new flag lands.
- **Parser in `apps/headless` only:** the playground's live-map mode would re-implement it; the
  parse is pure JSON→data and belongs in the sim package beside `WorldMap`.
- **High ground in this gate:** a combat change smuggled in as content plumbing — the precise
  anti-pattern the balance-sampling record rejected for the harness.

**Revisit trigger:** the first gate that wants high ground or build-placement rules writes its
own record; the legend and the v2 flags field extend without a format break.
