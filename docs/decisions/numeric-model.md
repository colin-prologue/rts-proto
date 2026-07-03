# Decision: numeric model — fixed-point

**Status:** decided (implemented). Revisit only with a replacement record.

## Choice
All simulated quantities use **fixed-point integer math** (`packages/sim/src/fixed.ts`, 16.16,
BigInt intermediates for mul/div). Floats are allowed only at the authoring boundary (`fromFloat`)
and the render boundary (`toFloat`), never inside simulated state. A `Fixed` newtype makes accidental
float entry a compile error.

## Why
The sim must produce byte-identical results in Node and in every browser. IEEE-754 add/sub/mul/div
are deterministic, but transcendental functions (`sin`, `cos`, `sqrt`) are **not** guaranteed
identical across V8 / SpiderMonkey / JSC. Fixed-point sidesteps the whole class of drift and makes
the guarantee structural rather than a discipline everyone has to remember.

## Rejected: fenced floats
Keep floats but quantize at every boundary and ban transcendentals in the sim. Lighter to write,
but the guarantee is a convention a reviewer must enforce on every change; one stray `Math.sqrt`
desyncs silently. Fixed-point trades a little ergonomics for a compile-time guard. If a future need
for heavy trig makes fixed-point painful, revisit with a lookup-table or a carefully-fenced-float
record.
