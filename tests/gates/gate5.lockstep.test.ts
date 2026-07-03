import { describe, it, expect } from 'vitest'
import WebSocket from 'ws'
import { Relay, createClient, DELAY, CHECKSUM_EVERY, type Client, type CommandFrame } from '@rts/net'
import { startWsRelay } from '../../packages/net/src/ws'
import { initialState, step, fromInt, type Command, type State } from '@rts/sim'

// Scripted input: player 0 orders scout moves on fixed turns; player 1 stays idle the whole match
// (every one of its frames is empty — "I did nothing" is still a message).
const scriptFor =
  (playerId: number) =>
  (_s: State, turn: number): Command[] => {
    if (playerId !== 0) return []
    if (turn === 4) return [{ type: 'MOVE', playerId, seq: 0, unitIds: [1], payload: { x: fromInt(9), y: fromInt(9) } }]
    if (turn === 40) return [{ type: 'MOVE', playerId, seq: 0, unitIds: [1], payload: { x: fromInt(2), y: fromInt(2) } }]
    return []
  }

function runInProcess(maxTurn: number, stepFnB?: (s: State, c: Command[]) => State) {
  const relay = new Relay(2)
  const clients: Client[] = []
  for (const pid of [0, 1]) {
    const client = createClient({
      playerId: pid,
      initial: initialState(7),
      send: (f) => relay.submit(f),
      local: scriptFor(pid),
      maxTurn,
      stepFn: pid === 1 ? stepFnB : undefined,
    })
    relay.connect(pid, (p) => client.onPacket(p))
    clients.push(client)
  }
  for (const c of clients) c.start()
  return { relay, a: clients[0], b: clients[1] }
}

describe('Gate 5 — lockstep multiplayer', () => {
  it('exposes the leapfrog constants', () => {
    expect(DELAY).toBe(2)
    expect(CHECKSUM_EVERY).toBe(32)
  })

  it('two in-process clients hold matching per-turn hashes across N turns (commands only)', () => {
    const N = 100
    const { relay, a, b } = runInProcess(N)
    expect(a.hashes.size).toBe(N + 1) // every turn 0..N executed — no stall on empty frames
    expect(b.hashes.size).toBe(N + 1)
    for (let t = 0; t <= N; t++) {
      expect(b.hashes.get(t), `turn ${t}`).toBe(a.hashes.get(t))
    }
    // the scripted MOVE actually crossed the wire and did something on both peers
    const scout = a.state.entities.find((e) => e.id === 1)!
    expect(scout.x).toBe(fromInt(2))
    expect(relay.desyncedAt).toBeNull() // checksums at 32/64/96 all agreed
  })

  it('input aimed at the seed window (turns 0..DELAY-1) never executes — empty frames only', () => {
    // A hostile/buggy input source with commands for turns 0 and 1 must be ignored: start()
    // seeds literal empty frames and never consults local() before the delay window.
    const relay = new Relay(2)
    const clients: Client[] = []
    for (const pid of [0, 1]) {
      const client = createClient({
        playerId: pid,
        initial: initialState(7),
        send: (f) => relay.submit(f),
        local: (_s, turn) =>
          pid === 0 && turn < DELAY
            ? [{ type: 'MOVE', playerId: 0, seq: 0, unitIds: [1], payload: { x: fromInt(9), y: fromInt(9) } }]
            : [],
        maxTurn: 10,
      })
      relay.connect(pid, (p) => client.onPacket(p))
      clients.push(client)
    }
    for (const c of clients) c.start()
    const scout = clients[0].state.entities.find((e) => e.id === 1)!
    expect(scout.x).toBe(fromInt(1)) // never moved — the early order was never broadcast
    expect(scout.target).toBeUndefined()
    expect(clients[0].hashes.get(10)).toBe(clients[1].hashes.get(10))
  })

  it('a deliberately corrupted client is caught at the first checksum exchange', () => {
    // Client B silently corrupts one hp at tick 10 — a state-level desync with no bad command.
    const corrupt = (s: State, c: Command[]): State => {
      const r = step(s, c)
      if (r.tick === 10) {
        return { ...r, entities: r.entities.map((e) => (e.id === 1 ? { ...e, hp: e.hp - 1 } : e)) }
      }
      return r
    }
    const { relay, a, b } = runInProcess(40, corrupt)
    // executing packet turn T produces tick T+1, so tick 10 corrupts during turn 9
    expect(a.hashes.get(8)).toBe(b.hashes.get(8)) // identical before the corruption...
    expect(a.hashes.get(9)).not.toBe(b.hashes.get(9)) // ...divergent from it
    expect(relay.desyncedAt).toBe(CHECKSUM_EVERY) // caught at the first exchange, not tolerated
  })

  it('injected nondeterminism (Math.random / wall-clock) diverges hashes and the checksum flags it', () => {
    const nondeterministic = (s: State, c: Command[]): State => {
      const r = step(s, c)
      if (r.tick === 15) {
        const jitter = (Math.floor(Math.random() * 1000) ^ Date.now()) >>> 0 // the banned pattern
        return { ...r, rng: (r.rng + (jitter | 1)) >>> 0 }
      }
      return r
    }
    const { relay, a, b } = runInProcess(40, nondeterministic)
    expect(a.hashes.get(13)).toBe(b.hashes.get(13)) // tick 15 = turn 14
    expect(a.hashes.get(14)).not.toBe(b.hashes.get(14))
    expect(relay.desyncedAt).toBe(CHECKSUM_EVERY)
  })

  it('the same two-client sync passes over the local WebSocket transport', async () => {
    const N = 40
    const { port, relay, close } = await startWsRelay(2)
    const runPeer = (pid: number) =>
      new Promise<Client>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}`)
        const client = createClient({
          playerId: pid,
          initial: initialState(7),
          send: (f: CommandFrame) => ws.send(JSON.stringify({ kind: 'frame', frame: f })),
          local: scriptFor(pid),
          maxTurn: N,
        })
        ws.on('open', () => {
          ws.send(JSON.stringify({ kind: 'hello', playerId: pid }))
          client.start()
        })
        ws.on('message', (raw) => {
          const msg = JSON.parse(raw.toString())
          if (msg.kind === 'turn') {
            client.onPacket(msg.packet)
            if (msg.packet.turn === N) {
              ws.close()
              resolve(client)
            }
          }
        })
        ws.on('error', reject)
      })
    const [a, b] = await Promise.all([runPeer(0), runPeer(1)])
    await close()
    expect(a.hashes.size).toBe(N + 1)
    for (let t = 0; t <= N; t++) {
      expect(b.hashes.get(t), `turn ${t}`).toBe(a.hashes.get(t))
    }
    expect(relay.desyncedAt).toBeNull()
  })
})
