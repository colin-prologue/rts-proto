// Balance harness CLI: `npm run balance -- <compA> <compB> [--map M] [--runs N] [--seed S]
// [--replay I]` (runs under vite-node so the package aliases resolve). Comps resolve by name
// from tests/gates/fixtures/comps/ and maps from tests/gates/fixtures/maps/, or by path when
// the argument points at a file. --replay writes the chosen run to apps/playground/public/
// replays/ so the Gate 6 viewer can fetch it (map runs export as v2 with the map embedded).
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { hashState, replay, buildReplayInitial } from '@rts/sim'
import { loadComp, loadMap, runBalance, exportRun, serializeReport, reportHash, sideSkew } from './balance'

const args = process.argv.slice(2)
const positional: string[] = []
const flags = new Map<string, string>()
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) flags.set(args[i].slice(2), args[++i])
  else positional.push(args[i])
}

if (positional.length !== 2) {
  console.error('usage: npm run balance -- <compA> <compB> [--map M] [--runs N] [--seed S] [--replay I] [--out report.json]')
  process.exit(1)
}

const fixturePath = (kind: string) => (arg: string) =>
  arg.includes('/') || arg.endsWith('.json') ? resolve(arg) : resolve(`tests/gates/fixtures/${kind}/${arg}.json`)
const compPath = fixturePath('comps')
const mapPath = fixturePath('maps')

const compA = loadComp(compPath(positional[0]))
const compB = loadComp(compPath(positional[1]))
const mapArg = flags.get('map')
const totalRuns = Number(flags.get('runs') ?? 1000)
const opts = {
  baseSeed: Number(flags.get('seed') ?? 20260704),
  seedCount: Math.max(1, Math.ceil(totalRuns / 2)), // each seed plays both orientations
  ...(mapArg ? { map: loadMap(mapPath(mapArg)) } : {}),
}

const report = runBalance(compA, compB, opts)
const a = report.aggregate
const pct = (n: number) => ((100 * n) / a.runs).toFixed(1)
const arena = opts.map ? ` on ${opts.map.name}` : ''
console.log(`\n${compA.name} (A) vs ${compB.name} (B)${arena} — ${a.runs} runs, base seed ${opts.baseSeed}`)
console.log(`  A wins ${a.winsA} (${pct(a.winsA)}%)   B wins ${a.winsB} (${pct(a.winsB)}%)   draws ${a.draws}`)
console.log(`  per orientation (A as p0 | A as p1): ${a.perOrientation.map((o) => `A ${o.winsA} / B ${o.winsB} / d ${o.draws}`).join('  |  ')}`)
console.log(`  mean match length ${a.meanTicks} ticks   distinct outcomes ${a.distinctOutcomes}/${a.runs}`)
const skew = sideSkew(report)
console.log(`  per player slot (fairness readout): p0 ${skew.slot0} / p1 ${skew.slot1} — skew ${skew.skew}`)
console.log(`  report hash ${reportHash(serializeReport(report))}`)

const out = flags.get('out')
if (out) {
  writeFileSync(resolve(out), serializeReport(report))
  console.log(`  report written to ${resolve(out)}`)
}

const replayIndex = flags.get('replay')
if (replayIndex !== undefined) {
  const run = Number(replayIndex)
  const row = report.runs[run]
  if (!row) {
    console.error(`no run ${run} in this report (0..${report.runs.length - 1})`)
    process.exit(1)
  }
  const file = exportRun(compA, compB, opts, run)
  const end = replay(buildReplayInitial(file), file.log)
  const outPath = resolve(`apps/playground/public/replays/${file.name}.json`)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, JSON.stringify(file))
  console.log(
    `  run ${run} (seed ${row.seed}, ${row.winner} wins in ${row.ticks} ticks) -> ${outPath}` +
      `\n  re-simulated end hash ${hashState(end) >>> 0} (report row says ${row.endHash})`
  )
}
