import { runGate, GATES } from './_lib.mjs'
const [, file] = GATES.find(([g]) => g === 2)
process.exit(runGate(2, file))
