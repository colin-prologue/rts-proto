import { runGate, GATES } from './_lib.mjs'
const [, file] = GATES.find(([g]) => g === 6)
process.exit(runGate(6, file))
