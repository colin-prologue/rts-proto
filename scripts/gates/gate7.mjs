import { runGate, GATES } from './_lib.mjs'
const [, file] = GATES.find(([g]) => g === 7)
process.exit(runGate(7, file))
