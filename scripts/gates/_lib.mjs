import { spawnSync } from 'node:child_process'

// Run one gate's test file through vitest and print a banner the /goal evaluator can read in the
// transcript. Exit code mirrors the suite so `npm run gate:N` is a clean pass/fail.
export function runGate(n, file) {
  const r = spawnSync('npx', ['vitest', 'run', file, '--reporter=dot'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  const ok = r.status === 0 && goldensCommitted()
  console.log(`\n${ok ? 'GATE ' + n + ' PASS' : 'GATE ' + n + ' FAIL'}`)
  return ok ? 0 : (r.status || 1)
}

// Golden hashes are the cross-env determinism anchor. Re-recording one must be a visible,
// deliberate act — an uncommitted or modified golden fails every gate until it is committed
// (with a message saying why the hash moved). Without this, the cheapest way past a golden
// check is to silently regenerate the file.
function goldensCommitted() {
  const r = spawnSync('git', ['status', '--porcelain', 'tests/gates/golden'], { encoding: 'utf8' })
  if (r.status !== 0) return true // not a git checkout — nothing to anchor against
  const dirty = (r.stdout ?? '').trim()
  if (dirty) {
    console.error(
      '\ngolden value(s) uncommitted or modified — commit tests/gates/golden deliberately,' +
        ` stating why the hash changed:\n${dirty}`
    )
  }
  return !dirty
}

export const GATES = [
  [1, 'tests/gates/gate1.determinism.test.ts'],
  [2, 'tests/gates/gate2.renderer.test.ts'],
  [3, 'tests/gates/gate3.rtsloop.test.ts'],
  [4, 'tests/gates/gate4.ai.test.ts'],
  [5, 'tests/gates/gate5.lockstep.test.ts'],
  [6, 'tests/gates/gate6.replay.test.ts'],
  [7, 'tests/gates/gate7.balance.test.ts'],
  [8, 'tests/gates/gate8.terrain.test.ts'],
  [9, 'tests/gates/gate9.movement.test.ts'],
]
