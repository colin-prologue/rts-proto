import { runGate } from './_lib.mjs'
// Joins the GATES loop in _lib.mjs (and thus gates:all) as part of Gate 8's own acceptance —
// until then it runs standalone so gates:all keeps reflecting the completed 1..7 campaign.
process.exit(runGate(8, 'tests/gates/gate8.terrain.test.ts'))
