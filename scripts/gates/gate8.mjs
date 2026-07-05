import { runGate, GATES } from './_lib.mjs'
const [, file] = GATES.find(([g]) => g === 8)
process.exit(runGate(8, file))
