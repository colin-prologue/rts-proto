import { describe, it, expect } from 'vitest'
import { initialState, spawn, step, fromInt, type Command, type State } from '@rts/sim'

const cmd = (type: Command['type'], playerId: number, unitIds: number[], payload?: unknown): Command =>
  ({ type, playerId, seq: 0, unitIds, payload })

describe('command ownership (lockstep identity contract)', () => {
  // playerId is the only identity a command carries — orders for units the issuer does not own
  // must be ignored, or any peer could command the opponent's army on every client.
  it('MOVE from a non-owner is ignored', () => {
    const s = step(initialState(1), [cmd('MOVE', 1, [1], { x: fromInt(5), y: fromInt(5) })])
    const scout = s.entities.find((e) => e.id === 1)! // scout is owned by player 0
    expect(scout.x).toBe(fromInt(1))
    expect(scout.target).toBeUndefined()
  })

  it('STOP/ATTACK/GATHER from a non-owner are ignored', () => {
    let s = initialState(1)
    s = spawn(s, 'grunt', 1, fromInt(3), fromInt(1)) // id 2, enemy in scout range... far enough
    // legitimate owner orders an attack
    s = step(s, [cmd('ATTACK', 0, [1], { targetId: 2 })])
    expect(s.entities.find((e) => e.id === 1)!.attackTarget).toBe(2)
    // enemy tries to cancel it — ignored
    s = step(s, [cmd('STOP', 1, [1])])
    expect(s.entities.find((e) => e.id === 1)!.attackTarget).toBe(2)
    // enemy tries to redirect a gather — ignored (worker setup)
    let g = initialState(2)
    g = spawn(g, 'minerals', -1, fromInt(2), fromInt(1)) // id 2
    g = spawn(g, 'worker', 0, fromInt(1), fromInt(2)) // id 3
    g = step(g, [cmd('GATHER', 1, [3], { nodeId: 2 })])
    expect(g.entities.find((e) => e.id === 3)!.gatherTarget).toBeUndefined()
  })
})

describe('supply accounting on producer death', () => {
  it('a dying producer releases the supply reserved by its queue', () => {
    let s = initialState(9)
    s = spawn(s, 'depot', 0, fromInt(10), fromInt(10)) // id 2, provides 8
    const baseline = s.players.find((p) => p.id === 0)!.supplyUsed // scout = 1
    s = step(s, [cmd('TRAIN', 0, [2], { unit: 'grunt' }), { ...cmd('TRAIN', 0, [2], { unit: 'grunt' }), seq: 1 }])
    expect(s.players.find((p) => p.id === 0)!.supplyUsed).toBe(baseline + 4) // 2 grunts reserved
    // kill the depot with its queue still full
    const killed: State = {
      ...s,
      entities: s.entities.map((e) => (e.id === 2 ? { ...e, hp: 0 } : e)),
    }
    const after = step(killed, [])
    expect(after.entities.some((e) => e.id === 2)).toBe(false)
    expect(after.players.find((p) => p.id === 0)!.supplyUsed).toBe(baseline) // reservation released
  })
})
