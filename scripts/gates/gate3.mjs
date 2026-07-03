import { runGate, GATES } from './_lib.mjs'
const [, file] = GATES.find(([g]) => g === 3)
process.exit(runGate(3, file))
