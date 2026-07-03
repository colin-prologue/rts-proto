// WebSocket transport for the relay — a thin JSON pipe around the same Relay. Node-only (uses
// 'ws'); deliberately not exported from index.ts so browser bundles of @rts/net never pull it in.
// Protocol: client → {kind:'hello', playerId} then {kind:'frame', frame}; server → {kind:'turn',
// packet}. Commands only — the frame format is the whole wire contract (CONSTITUTION V).
import { WebSocketServer } from 'ws'
import { Relay, type CommandFrame, type TurnPacket } from './index'

export interface WsRelayHandle {
  port: number
  relay: Relay
  close(): Promise<void>
}

export function startWsRelay(expectedPeers = 2): Promise<WsRelayHandle> {
  const relay = new Relay(expectedPeers)
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as
        | { kind: 'hello'; playerId: number }
        | { kind: 'frame'; frame: CommandFrame }
      if (msg.kind === 'hello') {
        relay.connect(msg.playerId, (packet: TurnPacket) =>
          ws.send(JSON.stringify({ kind: 'turn', packet }))
        )
      } else {
        relay.submit(msg.frame)
      }
    })
  })
  return new Promise((resolve) => {
    wss.on('listening', () => {
      const addr = wss.address()
      resolve({
        port: typeof addr === 'object' && addr ? addr.port : 0,
        relay,
        close: () => new Promise((r) => wss.close(() => r())),
      })
    })
  })
}
