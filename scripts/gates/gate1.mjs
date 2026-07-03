import { runGate, GATES } from './_lib.mjs'
const [, file] = GATES.find(([g]) => g === 1)
process.exit(runGate(1, file))
