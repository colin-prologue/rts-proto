import { runGate } from './_lib.mjs'
// Joins the GATES loop in _lib.mjs (and thus gates:all) as part of Gate 7's own acceptance —
// until then it runs standalone so gates:all keeps reflecting the completed 1..6 campaign.
process.exit(runGate(7, 'tests/gates/gate7.balance.test.ts'))
