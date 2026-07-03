// Browser harness: PixiJS over the sim. Two modes:
//   /                     live sandbox — right-click moves the scout (delay 0, single player)
//   /?replay=gate4-match  replay viewer — plays a recorded ReplayFile with full overlays
// The render side may read the wall clock — it only decides how far to interpolate between the
// last two sim states. All world changes go through commands; the viewer only ever *watches*.
import { Application, Graphics, Container, Text } from 'pixi.js'
import {
  initialState,
  step,
  hashState,
  buildReplayInitial,
  type State,
  type Command,
  type SimEvent,
  type ReplayFile,
} from '@rts/sim'
import {
  createProjection,
  interpolatePositions,
  rightClickToMove,
  flybysFrom,
  hpFraction,
  queuePips,
  TILE_H,
} from '@rts/render'

const TICK_MS = 100 // 10 Hz sim, per architecture; render interpolates at display rate
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8]
const proj = createProjection()
const hud = document.getElementById('hud')!

const OWNER_COLOR: Record<number, number> = { 0: 0x66ff88, 1: 0xff7766, [-1]: 0x88bbff }
const STATUS = { gather: 0x33aaff, attack: 0xff4444, move: 0xffcc33 }

const app = new Application()
await app.init({ resizeTo: window, background: '#111418', antialias: true })
document.body.appendChild(app.canvas)

const world = new Container()
world.position.set(window.innerWidth / 2, 120)
app.stage.addChild(world)
const unitLayer = new Graphics()
const flybyLayer = new Container()
const ackLayer = new Graphics()
world.addChild(unitLayer, flybyLayer, ackLayer)

// ---- shared drawing --------------------------------------------------------------------------

interface FlybyText {
  node: Text
  vy: number
  ttl: number
}
const flybyTexts: FlybyText[] = []

function spawnFlybys(events: SimEvent[], next: State) {
  const positions = interpolatePositions(next, next, 0)
  for (const f of flybysFrom(events, positions)) {
    const [sx, sy] = proj.worldToScreen(f.x, f.y)
    const node = new Text({
      text: `-${f.amount}`,
      style: { fill: 0xffd166, fontSize: 13, fontFamily: 'monospace', fontWeight: 'bold' },
    })
    node.anchor.set(0.5)
    node.position.set(sx, sy - 22)
    flybyLayer.addChild(node)
    flybyTexts.push({ node, vy: -0.7, ttl: 1 })
  }
}

function animateFlybys() {
  for (let i = flybyTexts.length - 1; i >= 0; i--) {
    const f = flybyTexts[i]
    f.node.y += f.vy
    f.ttl -= 0.02
    f.node.alpha = Math.max(0, f.ttl)
    if (f.ttl <= 0) {
      flybyLayer.removeChild(f.node)
      f.node.destroy()
      flybyTexts.splice(i, 1)
    }
  }
}

function drawWorld(state: State, positions: Map<number, { x: number; y: number }>, selected: Set<number>) {
  const g = unitLayer
  g.clear()
  for (const e of state.entities) {
    const pos = positions.get(e.id)
    if (!pos) continue
    const [sx, sy] = proj.worldToScreen(pos.x, pos.y)
    const spec = state.data.units[e.type]
    const color = OWNER_COLOR[e.owner] ?? 0xcccccc
    const alpha = (e.constructing ?? 0) > 0 ? 0.45 : 1

    // body: buildings square, minerals diamond, workers small, army large
    if (spec?.trains) g.rect(sx - 14, sy - 14, 28, 28).fill({ color, alpha })
    else if (e.type === 'minerals') g.poly([sx, sy - 10, sx + 12, sy, sx, sy + 10, sx - 12, sy]).fill({ color, alpha: 0.9 })
    else if (spec?.gather) g.circle(sx, sy, 6).fill({ color, alpha })
    else g.circle(sx, sy, TILE_H / 3.2).fill({ color, alpha })
    if (selected.has(e.id)) g.circle(sx, sy, 14).stroke({ color: 0xffffff, alpha: 0.8 })

    // resource / hp bar
    if (e.type === 'minerals') {
      const frac = Math.min(1, (e.amount ?? 0) / (spec?.amount || 1))
      g.rect(sx - 12, sy - 18, 24, 3).fill(0x223344)
      g.rect(sx - 12, sy - 18, 24 * frac, 3).fill(0x55aaff)
    } else {
      const frac = hpFraction(e.hp, spec?.hp ?? 1)
      g.rect(sx - 12, sy - 20, 24, 3).fill(0x331111)
      g.rect(sx - 12, sy - 20, 24 * frac, 3).fill(frac > 0.5 ? 0x55dd55 : frac > 0.25 ? 0xddbb33 : 0xdd4433)
    }

    // production queue: one pip per queued unit + head progress bar
    const pips = queuePips(e.queue, state.data.units)
    if (pips.count > 0) {
      for (let i = 0; i < pips.count; i++) g.circle(sx - 10 + i * 7, sy - 27, 2.5).fill(0xffffff)
      g.rect(sx - 12, sy - 24, 24, 2).fill(0x223322)
      g.rect(sx - 12, sy - 24, 24 * pips.headProgress, 2).fill(0x88ff88)
    }

    // status dot: blue gathering / red attacking / yellow moving (legend in HUD)
    const status =
      e.gatherTarget !== undefined ? STATUS.gather :
      e.attackTarget !== undefined ? STATUS.attack :
      e.target ? STATUS.move : 0
    if (status) g.circle(sx + 16, sy - 14, 3.5).fill(status)
  }
}

function supplyOf(state: State, owner: number): [number, number] {
  const used = state.players.find((p) => p.id === owner)?.supplyUsed ?? 0
  let cap = 0
  for (const e of state.entities) {
    if (e.owner === owner || (e.constructing ?? 0) > 0) {
      if (e.owner === owner && (e.constructing ?? 0) === 0) cap += state.data.units[e.type]?.provides ?? 0
    }
  }
  return [used, cap]
}

function hudLines(state: State, extra: string): string {
  const rows = state.players.map((p) => {
    const [used, cap] = supplyOf(state, p.id)
    const name = p.id === 0 ? 'P0 (green)' : `P${p.id} (red)`
    return `${name}  minerals ${p.minerals}  supply ${used}/${cap}`
  })
  return [
    `tick ${state.tick}  hash ${hashState(state).toString(16)}  ${extra}`,
    ...rows,
    'status dots: blue=gathering  red=attacking  yellow=moving   bars: hp / blue=minerals  pips=queue',
  ].join('\n')
}

// ---- modes -----------------------------------------------------------------------------------

const replayName = new URLSearchParams(location.search).get('replay')

if (replayName) {
  // -------- replay viewer --------
  const file = (await (await fetch(`/replays/${replayName}.json`)).json()) as ReplayFile
  let prev = buildReplayInitial(file)
  let next = prev
  let turn = 0
  let speedIdx = 2 // 1x
  let paused = false
  let acc = 0
  let last = performance.now()

  const advance = () => {
    if (turn >= file.log.length) return false
    const events: SimEvent[] = []
    prev = next
    next = step(next, file.log[turn] ?? [], events)
    turn++
    spawnFlybys(events, next)
    return true
  }

  window.addEventListener('keydown', (ev) => {
    if (ev.key === ' ') { paused = !paused; ev.preventDefault() }
    else if (ev.key === '.') { paused = true; advance() }
    else if (ev.key === '+' || ev.key === '=') speedIdx = Math.min(SPEEDS.length - 1, speedIdx + 1)
    else if (ev.key === '-') speedIdx = Math.max(0, speedIdx - 1)
    else if (ev.key === 'r' || ev.key === 'R') {
      prev = next = buildReplayInitial(file); turn = 0; paused = false
      for (const f of flybyTexts.splice(0)) { flybyLayer.removeChild(f.node); f.node.destroy() }
    }
  })

  app.ticker.add(() => {
    const now = performance.now()
    const dt = now - last
    last = now
    if (!paused && turn < file.log.length) {
      acc += dt * SPEEDS[speedIdx]
      while (acc >= TICK_MS) {
        if (!advance()) break
        acc -= TICK_MS
      }
    }
    const t = paused || turn >= file.log.length ? 1 : Math.min(1, acc / TICK_MS)
    drawWorld(next, interpolatePositions(prev, next, t), new Set())
    animateFlybys()
    const state = turn >= file.log.length ? 'ENDED' : paused ? 'PAUSED' : `${SPEEDS[speedIdx]}x`
    hud.textContent = hudLines(next, `replay ${file.name}  turn ${turn}/${file.log.length}  [${state}]  space=pause  .=step  +/-=speed  r=restart`)
  })
} else {
  // -------- live sandbox --------
  let prev: State = initialState(1)
  let next: State = step(prev, [])
  let pending: Command[] = []
  let seq = 0
  const selected = new Set<number>([1])
  let ack: { x: number; y: number; ttl: number } | null = null

  app.canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault()
    const sx = ev.clientX - world.position.x
    const sy = ev.clientY - world.position.y
    const [wx, wy] = proj.screenToWorld(sx, sy)
    pending.push(rightClickToMove([...selected], wx, wy, 0, seq++))
    ack = { x: sx, y: sy, ttl: 1 }
  })

  let acc = 0
  let last = performance.now()
  app.ticker.add(() => {
    const now = performance.now()
    acc += now - last
    last = now
    while (acc >= TICK_MS) {
      const events: SimEvent[] = []
      prev = next
      next = step(next, pending, events)
      pending = []
      spawnFlybys(events, next)
      acc -= TICK_MS
    }
    drawWorld(next, interpolatePositions(prev, next, acc / TICK_MS), selected)
    animateFlybys()
    ackLayer.clear()
    if (ack) {
      ackLayer.circle(ack.x, ack.y, 6 + (1 - ack.ttl) * 14).stroke({ color: 0x66ff88, alpha: ack.ttl })
      ack.ttl -= 0.05
      if (ack.ttl <= 0) ack = null
    }
    hud.textContent = hudLines(next, 'sandbox — right-click to move  (open /?replay=gate4-match for the match replay)')
  })
}
