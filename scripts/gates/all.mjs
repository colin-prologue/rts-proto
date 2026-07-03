import { runGate, GATES } from './_lib.mjs'

// Gates are strictly ordered — stop at the first failure so the baseline is legible.
let failed = false
for (const [n, file] of GATES) {
  if (runGate(n, file) !== 0) { failed = true; break }
}
if (!failed) console.log('\nALL GATES PASS')
process.exit(failed ? 1 : 0)
