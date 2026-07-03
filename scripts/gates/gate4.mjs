import { runGate, GATES } from './_lib.mjs'
const [, file] = GATES.find(([g]) => g === 4)
process.exit(runGate(4, file))
