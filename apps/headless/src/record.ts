// Replay recorder CLI: `npm run replay:record <scenario>` (runs under vite-node so the package
// aliases resolve). Writes to apps/playground/public/replays/ so the browser viewer can fetch
// the same file the gate test verifies.
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { hashState, replay, buildReplayInitial } from '@rts/sim'
import { SCENARIOS } from './scenarios'

const name = process.argv[2] ?? 'gate4'
const make = SCENARIOS[name]
if (!make) {
  console.error(`unknown scenario "${name}" — available: ${Object.keys(SCENARIOS).join(', ')}`)
  process.exit(1)
}

const file = make()
const end = replay(buildReplayInitial(file), file.log)
const out = resolve(`apps/playground/public/replays/${file.name}.json`)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(file))
console.log(`recorded ${file.name}: ${file.log.length} turns, end hash ${hashState(end) >>> 0} -> ${out}`)
