import { runGate, GATES } from './_lib.mjs'
const [, file] = GATES.find(([g]) => g === 9)
process.exit(runGate(9, file))
