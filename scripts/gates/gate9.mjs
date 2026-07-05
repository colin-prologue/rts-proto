import { runGate } from './_lib.mjs'
// Joins the GATES loop in _lib.mjs (and thus gates:all) as part of Gate 9's own acceptance —
// until then it runs standalone so gates:all keeps reflecting the completed 1..8 campaign.
process.exit(runGate(9, 'tests/gates/gate9.movement.test.ts'))
