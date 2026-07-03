// AI player emits the SAME commands as human input — no privileged state mutation (Gate 4).
// decide() is a pure READ of state: it returns commands and touches nothing. The gate test calls
// it on a deep-frozen state to prove that.
import type { State, Command, Entity } from '@rts/sim'

export interface AIPlayer {
  /** Observe state, return commands for this player. The only way an AI touches the world. */
  decide(state: State, playerId: number): Command[]
}

/** Chebyshev distance on raw fixed values — same metric the sim uses, no sqrt. */
const dist = (a: Entity, b: Entity) =>
  Math.max(Math.abs((a.x as number) - (b.x as number)), Math.abs((a.y as number) - (b.y as number)))

/**
 * Rule bot: keep workers on minerals, keep the depot producing grunts, send every armed unit at
 * the nearest enemy. Deliberately simple — it exists to validate the command abstraction and be
 * a deterministic sparring partner, not to be clever.
 */
export function createRuleBot(): AIPlayer {
  return {
    decide(state, playerId) {
      const cmds: Command[] = []
      let seq = 0
      const specs = state.data.units
      const mine = state.entities.filter((e) => e.owner === playerId)
      const enemies = state.entities.filter((e) => e.owner !== playerId && e.owner >= 0)
      const player = state.players.find((p) => p.id === playerId)
      if (!player) return cmds

      // Workers: gather from the nearest live mineral node (id-sorted scan → deterministic tiebreak).
      const nodes = state.entities.filter((e) => e.type === 'minerals' && (e.amount ?? 0) > 0)
      for (const w of mine) {
        if ((specs[w.type]?.gather ?? 0) > 0 && w.gatherTarget === undefined && nodes.length > 0) {
          let best = nodes[0]
          for (const n of nodes) if (dist(w, n) < dist(w, best)) best = n
          cmds.push({ type: 'GATHER', playerId, seq: seq++, unitIds: [w.id], payload: { nodeId: best.id } })
        }
      }

      // Production: one grunt at a time whenever the depot is idle and affordable.
      const depot = mine.find((e) => specs[e.type]?.trains && (e.constructing ?? 0) === 0)
      if (depot && !(depot.queue?.length) && player.minerals >= specs.grunt.cost) {
        cmds.push({ type: 'TRAIN', playerId, seq: seq++, unitIds: [depot.id], payload: { unit: 'grunt' } })
      }

      // Army: every armed, mobile unit without a target attacks the nearest enemy (id tiebreak).
      for (const u of mine) {
        const spec = specs[u.type]
        if (!spec || spec.damage <= 0 || spec.speed <= 0) continue
        if (u.attackTarget !== undefined || enemies.length === 0) continue
        let best = enemies[0]
        for (const e of enemies) if (dist(u, e) < dist(u, best)) best = e
        cmds.push({ type: 'ATTACK', playerId, seq: seq++, unitIds: [u.id], payload: { targetId: best.id } })
      }

      return cmds
    },
  }
}
