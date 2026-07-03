import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import {
  initialState,
  spawn,
  step,
  hashState,
  fromInt,
  DEFAULT_DATA,
  type Command,
  type State,
  type GameData,
  type UnitSpec,
} from '@rts/sim'

const cmd = (type: Command['type'], playerId: number, seq: number, unitIds: number[], payload?: unknown): Command =>
  ({ type, playerId, seq, unitIds, payload })

const runTicks = (s: State, ticks: number, commandsAt: Record<number, Command[]> = {}): State => {
  for (let i = 0; i < ticks; i++) s = step(s, commandsAt[s.tick] ?? [])
  return s
}

function goldenCheck(file: string, h: number) {
  const path = resolve(`tests/gates/golden/${file}`)
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, String(h >>> 0))
  }
  expect(h >>> 0).toBe(Number(readFileSync(path, 'utf8').trim()))
}

// Economy world: a depot (supply 8), a mineral node, a worker. Ids: scout=1, depot=2, node=3, worker=4.
function economyWorld(): State {
  let s = initialState(99)
  s = spawn(s, 'depot', 0, fromInt(10), fromInt(10))
  s = spawn(s, 'minerals', -1, fromInt(12), fromInt(10))
  s = spawn(s, 'worker', 0, fromInt(11), fromInt(10))
  return s
}

// Combat world: two grunts (p0, melee, normal) vs two archers (p1, ranged, pierce), paired off.
// Ids: scout=1, grunts=2,3, archers=4,5.
function combatWorld(data: GameData): State {
  let s = initialState(7, data)
  s = spawn(s, 'grunt', 0, fromInt(10), fromInt(10))
  s = spawn(s, 'grunt', 0, fromInt(10), fromInt(11))
  s = spawn(s, 'archer', 1, fromInt(14), fromInt(10))
  s = spawn(s, 'archer', 1, fromInt(14), fromInt(11))
  return s
}
const combatCommands: Record<number, Command[]> = {
  0: [
    cmd('ATTACK', 0, 0, [2], { targetId: 4 }),
    cmd('ATTACK', 0, 1, [3], { targetId: 5 }),
    cmd('ATTACK', 1, 0, [4], { targetId: 2 }),
    cmd('ATTACK', 1, 1, [5], { targetId: 3 }),
  ],
}
const survivorsOf = (s: State, owner: number, type: string) =>
  s.entities.filter((e) => e.owner === owner && e.type === type)

describe('Gate 3 — the RTS loop', () => {
  it('a worker gathers: player minerals rise, the node depletes, deterministically', () => {
    const run = () =>
      runTicks(economyWorld(), 40, { 0: [cmd('GATHER', 0, 0, [4], { nodeId: 3 })] })
    const end = run()
    const p0 = end.players.find((p) => p.id === 0)!
    const node = end.entities.find((e) => e.id === 3)!
    expect(p0.minerals).toBeGreaterThan(200)
    expect(node.amount!).toBeLessThan(DEFAULT_DATA.units.minerals.amount!)
    expect(p0.minerals - 200).toBe(DEFAULT_DATA.units.minerals.amount! - node.amount!)
    expect(hashState(end)).toBe(hashState(run()))
  })

  it('a building produces a unit from its queue after buildTime ticks', () => {
    const end = runTicks(economyWorld(), 12, { 0: [cmd('TRAIN', 0, 0, [2], { unit: 'worker' })] })
    const workers = survivorsOf(end, 0, 'worker')
    expect(workers.length).toBe(2) // the starting worker + the trained one
  })

  it('the supply cap blocks overproduction (TRAIN beyond cap is rejected, minerals untouched)', () => {
    // Depot provides cap 8; scout(1) + worker(1) already hold 2. Three grunts (2 each) fill the
    // cap exactly; the fourth and fifth TRAIN must be rejected and cost nothing.
    let s = economyWorld()
    const before = s.players.find((p) => p.id === 0)!
    expect(before.supplyUsed).toBe(2)
    s = step(s, [0, 1, 2, 3, 4].map((i) => cmd('TRAIN', 0, i, [2], { unit: 'grunt' })))
    const p0 = s.players.find((p) => p.id === 0)!
    expect(p0.supplyUsed).toBe(8) // 2 + 3×2 accepted, then rejected at the cap
    expect(p0.minerals).toBe(200 - 3 * DEFAULT_DATA.units.grunt.cost)
    const depot = s.entities.find((e) => e.id === 2)!
    expect(depot.queue!.length).toBe(3)
  })

  it('the economy scenario end state matches the committed golden', () => {
    const end = runTicks(economyWorld(), 60, {
      0: [cmd('GATHER', 0, 0, [4], { nodeId: 3 }), cmd('TRAIN', 0, 1, [2], { unit: 'grunt' })],
      20: [cmd('TRAIN', 0, 0, [2], { unit: 'archer' })],
    })
    goldenCheck('gate3.economy.hash', hashState(end))
  })

  it('combat resolves to a fixed winner from the damage/armor table', () => {
    const end = runTicks(combatWorld(DEFAULT_DATA), 30, combatCommands)
    expect(survivorsOf(end, 1, 'archer').length).toBe(2) // pierce 150% vs light wins the poke war
    expect(survivorsOf(end, 0, 'grunt').length).toBe(0)
    goldenCheck('gate3.combat.hash', hashState(end))
  })

  it('changing ONE damage-table value flips the combat outcome (content is data, live-tunable)', () => {
    const nerfedPierce: GameData = {
      ...DEFAULT_DATA,
      damageTable: {
        ...DEFAULT_DATA.damageTable,
        pierce: { ...DEFAULT_DATA.damageTable.pierce, light: 75 },
      },
    }
    const end = runTicks(combatWorld(nerfedPierce), 30, combatCommands)
    expect(survivorsOf(end, 0, 'grunt').length).toBeGreaterThan(0) // grunts now win
    expect(survivorsOf(end, 1, 'archer').length).toBe(0)
  })

  it('adding a unit is adding a data row — a JSON fixture fights with zero sim code changes', () => {
    const zealot = JSON.parse(
      readFileSync(resolve('tests/gates/fixtures/zealot.json'), 'utf8')
    ) as UnitSpec
    const data: GameData = {
      ...DEFAULT_DATA,
      units: { ...DEFAULT_DATA.units, zealot },
    }
    let s = initialState(3, data)
    s = spawn(s, 'zealot', 0, fromInt(5), fromInt(5))
    s = spawn(s, 'grunt', 1, fromInt(7), fromInt(5))
    const end = runTicks(s, 20, {
      0: [cmd('ATTACK', 0, 0, [2], { targetId: 3 }), cmd('ATTACK', 1, 0, [3], { targetId: 2 })],
    })
    // zealot (hp120, 14 normal) beats grunt (hp80, 10 normal) — the row fought and won
    expect(survivorsOf(end, 0, 'zealot').length).toBe(1)
    expect(survivorsOf(end, 1, 'grunt').length).toBe(0)
  })

  it('the pathfinding decision record exists and is ratified (not a proposal)', () => {
    const record = readFileSync(resolve('docs/decisions/pathfinding.md'), 'utf8')
    expect(record, 'flip **Status:** to decided when ratifying').toMatch(/status[^a-z\n]*decided/i)
  })
})
