// Browser harness: PixiJS over the sim. The render side may read the wall clock — it only decides
// how far to interpolate between the last two sim states. All world changes go through commands.
import { Application, Graphics, Container } from 'pixi.js'
import { initialState, step, hashState, type State, type Command } from '@rts/sim'
import { createProjection, interpolatePositions, rightClickToMove, TILE_H } from '@rts/render'

const TICK_MS = 100 // 10 Hz sim, per architecture; render interpolates at display rate
const proj = createProjection()

let prev: State = initialState(1)
let next: State = step(prev, [])
let pending: Command[] = [] // local queue; single-player => delay 0, consumed next tick
let seq = 0
const selected = new Set<number>([1]) // the scout starts selected so right-click works immediately

const app = new Application()
await app.init({ resizeTo: window, background: '#111418', antialias: true })
document.body.appendChild(app.canvas)

const world = new Container()
world.position.set(window.innerWidth / 2, 120)
app.stage.addChild(world)
const unitLayer = new Graphics()
const ackLayer = new Graphics()
world.addChild(unitLayer, ackLayer)
const hud = document.getElementById('hud')!

// Instant local acknowledgment: the flash is render-only state — the simulated move still waits
// for its tick (CONSTITUTION: rendering never mutates sim state).
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
    prev = next
    next = step(next, pending)
    pending = []
    acc -= TICK_MS
  }

  const t = acc / TICK_MS
  const positions = interpolatePositions(prev, next, t)
  unitLayer.clear()
  for (const [id, pos] of positions) {
    const [sx, sy] = proj.worldToScreen(pos.x, pos.y)
    unitLayer.circle(sx, sy, TILE_H / 2).fill(selected.has(id) ? 0x66ff88 : 0x8899ff)
  }
  ackLayer.clear()
  if (ack) {
    ackLayer.circle(ack.x, ack.y, 6 + (1 - ack.ttl) * 14).stroke({ color: 0x66ff88, alpha: ack.ttl })
    ack.ttl -= 0.05
    if (ack.ttl <= 0) ack = null
  }
  hud.textContent = `tick ${next.tick}  hash ${hashState(next).toString(16)}  right-click to move`
})
