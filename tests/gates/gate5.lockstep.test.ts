import { describe, it, expect } from 'vitest'
import { Relay, createClient, DELAY, CHECKSUM_EVERY } from '@rts/net'

describe('Gate 5 — lockstep multiplayer', () => {
  it('exposes the leapfrog constants', () => {
    expect(DELAY).toBe(2)
    expect(CHECKSUM_EVERY).toBe(32)
  })

  it('two in-process clients hold matching per-turn hashes across N turns', () => {
    // Contract: relay collects frames from both clients (empty frames included), bundles sorted by
    // playerId, broadcasts; each client applies + advances + sends turn+DELAY. Assert per-turn
    // hashes match the whole way, an empty-frame turn still advances, checksums catch a corrupted
    // client, and injected nondeterminism diverges the hashes. Fails until the relay/client exist.
    const relay = new Relay()
    void relay
    void createClient
    expect.fail('implement the relay + leapfrog client + two-client sync in Gate 5')
  })
})
