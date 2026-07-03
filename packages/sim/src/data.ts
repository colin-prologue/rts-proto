// Content as DATA, not code (architecture). A unit is a row; a counter relationship is a table
// cell. Design questions become edits here, run headless or live, kept or reverted. All values
// are plain integers so rows round-trip through JSON fixtures untouched; the sim converts to
// fixed-point at the use site.

export type DamageType = 'normal' | 'pierce' | 'siege'
export type ArmorType = 'light' | 'heavy' | 'building'

export interface UnitSpec {
  name: string
  hp: number
  armor: ArmorType
  damage: number // 0 = cannot attack
  damageType: DamageType
  range: number // Chebyshev grid distance
  speed: number // grid cells per tick; 0 = immobile (buildings, resource nodes)
  supply: number // supply consumed when trained
  cost: number // minerals
  buildTime: number // ticks in a production queue
  gather?: number // minerals per gather trip (workers)
  provides?: number // supply provided once construction completes (depots/bases)
  trains?: string[] // unit type names this building can produce
  amount?: number // starting minerals (resource nodes)
}

export interface GameData {
  units: Record<string, UnitSpec>
  /** damageTable[damageType][armorType] = integer percent multiplier. */
  damageTable: Record<DamageType, Record<ArmorType, number>>
}

export const GATHER_PERIOD = 8 // ticks between gather payouts while a worker is on a node

export const DEFAULT_DATA: GameData = {
  units: {
    scout: { name: 'scout', hp: 100, armor: 'light', damage: 5, damageType: 'normal', range: 1, speed: 1, supply: 1, cost: 25, buildTime: 5 },
    worker: { name: 'worker', hp: 60, armor: 'light', damage: 0, damageType: 'normal', range: 1, speed: 1, supply: 1, cost: 50, buildTime: 8, gather: 5 },
    grunt: { name: 'grunt', hp: 80, armor: 'light', damage: 10, damageType: 'normal', range: 1, speed: 1, supply: 2, cost: 50, buildTime: 10 },
    archer: { name: 'archer', hp: 60, armor: 'light', damage: 8, damageType: 'pierce', range: 4, speed: 1, supply: 2, cost: 75, buildTime: 12 },
    depot: { name: 'depot', hp: 400, armor: 'building', damage: 0, damageType: 'normal', range: 0, speed: 0, supply: 0, cost: 100, buildTime: 20, provides: 8, trains: ['worker', 'grunt', 'archer', 'scout'] },
    minerals: { name: 'minerals', hp: 1, armor: 'building', damage: 0, damageType: 'normal', range: 0, speed: 0, supply: 0, cost: 0, buildTime: 0, amount: 1500 },
  },
  damageTable: {
    normal: { light: 100, heavy: 100, building: 100 },
    pierce: { light: 150, heavy: 75, building: 50 },
    siege: { light: 50, heavy: 125, building: 200 },
  },
}

/** Integer damage after the type×armor table: floor(base × percent / 100). */
export function tableDamage(data: GameData, dt: DamageType, armor: ArmorType, base: number): number {
  return Math.floor((base * data.damageTable[dt][armor]) / 100)
}
