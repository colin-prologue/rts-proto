import { runGate, GATES } from './_lib.mjs'
const [, file] = GATES.find(([g]) => g === 5)
process.exit(runGate(5, file))
