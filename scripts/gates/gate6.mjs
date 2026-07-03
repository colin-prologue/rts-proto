import { runGate } from './_lib.mjs'
// Joins the GATES loop in _lib.mjs (and thus gates:all) as part of Gate 6's own acceptance —
// until then it runs standalone so gates:all keeps reflecting the completed 1..5 campaign.
process.exit(runGate(6, 'tests/gates/gate6.replay.test.ts'))
