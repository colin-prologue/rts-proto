// Sim event stream — decision: docs/decisions/sim-events.md (out-array, not callback).
// Events are OUTPUT ONLY: plain integers/ids/strings, no live entity references, nothing reads
// them back into simulated state (guarded by the Gate 6 golden-regression check). Their order is
// deterministic — it follows step()'s fixed phase order and stable-id iteration.

export type SimEvent =
  | { kind: 'SPAWN'; id: number; type: string; owner: number }
  | { kind: 'DEATH'; id: number; type: string; owner: number }
  | { kind: 'DAMAGE'; attacker: number; target: number; amount: number }
  | { kind: 'GATHER'; worker: number; node: number; amount: number }
  | { kind: 'TRAIN_START'; building: number; unit: string }
  | { kind: 'TRAIN_DONE'; building: number; unit: string; id: number }
  | { kind: 'TRAIN_BLOCKED'; building: number; unit: string; reason: 'minerals' | 'supply' }
