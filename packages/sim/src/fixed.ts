// Fixed-point numeric model. Decision: docs/decisions/numeric-model.md.
//
// All SIMULATED quantities use Fixed. Backing representation is an integer count of 1/SCALE
// units, stored in a JS number (exact while |raw| < 2^53). mul/div route through BigInt so the
// result is identical on every JS engine — this is the whole point of choosing fixed-point over
// floats for a sim that must run byte-identically in Node and every browser (CONSTITUTION VI).
//
// Floats are permitted ONLY at the authoring boundary (fromFloat) and the render boundary
// (toFloat). They must never re-enter simulated state.

export type Fixed = number & { readonly __fixed: unique symbol }

export const SCALE = 65536 // 2^16
const SCALE_BIG = 65536n

export const fromInt = (i: number): Fixed => (i * SCALE) as Fixed
/** AUTHORING ONLY — quantizes a float to the fixed grid deterministically. */
export const fromFloat = (f: number): Fixed => Math.round(f * SCALE) as Fixed
/** RENDER ONLY — never feed the result back into sim state. */
export const toFloat = (a: Fixed): number => (a as number) / SCALE

export const add = (a: Fixed, b: Fixed): Fixed => ((a as number) + (b as number)) as Fixed
export const sub = (a: Fixed, b: Fixed): Fixed => ((a as number) - (b as number)) as Fixed
export const neg = (a: Fixed): Fixed => (-(a as number)) as Fixed

// BigInt intermediates keep mul/div exact and engine-independent (truncating toward zero).
export const mul = (a: Fixed, b: Fixed): Fixed =>
  Number((BigInt(a as number) * BigInt(b as number)) / SCALE_BIG) as Fixed
export const div = (a: Fixed, b: Fixed): Fixed =>
  Number((BigInt(a as number) * SCALE_BIG) / BigInt(b as number)) as Fixed

export const floorToInt = (a: Fixed): number => Math.floor((a as number) / SCALE)
export const cmp = (a: Fixed, b: Fixed): number => (a as number) - (b as number)

/** Raw integer backing value — for hashing/serialization only. */
export const raw = (a: Fixed): number => a as number
