// --- Roulette wheel widget --------------------------------------------
// Ports the SVG sector/label math from pages/tools/RouletteWheel.tsx
// (the same component the standalone Roulette tool page itself
// renders) into plain DOM/SVG calls — this file has no React runtime,
// same reasoning every other build* function here already follows.

const ROULETTE_WHEEL_LABEL_INNER_RADIUS = 18
const ROULETTE_WHEEL_LABEL_OUTER_RADIUS = 88
const ROULETTE_WHEEL_LABEL_FONT_SIZE = 7.5
const ROULETTE_WHEEL_LABEL_CHAR_WIDTH_RATIO = 0.58
const ROULETTE_WHEEL_LABEL_PADDING = 3
// Must match RouletteEngine.SPIN_DURATION_MS / RouletteWheel.tsx's own SPIN_DURATION_MS/WHEEL_EXTRA_SPINS.
const ROULETTE_SPIN_DURATION_MS = 5000
const ROULETTE_WHEEL_EXTRA_SPINS = 6

// The RESTING rotation (deg) the wheel is parked at — persists across
// renders (this whole scene tree gets torn down and rebuilt on every
// render() call, so this can't just live as an element's own current
// style the way RouletteWheel.tsx's React state does). Mirrors
// RouletteToolPage.tsx's own wheelRotationRef.
let rouletteWheelRotationDeg = 0

// Set for exactly one render pass, by the 'roulette-state' WS handler,
// the instant a round transitions into 'spinning' — the rotation to
// animate FROM (rouletteWheelRotationDeg by then already holds the
// NEW target). buildRouletteWheel reads and immediately clears it, so
// an unrelated re-render mid-spin (there shouldn't be one — no other
// event fires during the 5s window) doesn't replay the animation.
let rouletteSpinFromDeg = null

// Cancels/invalidates the live pointer-tracking loop (see
// buildRouletteWheel's own tick() below) whenever a NEWER wheel build
// starts — otherwise a stale loop from a torn-down element would keep
// running (harmlessly, but pointlessly) forever.
let rouletteTrackingRafId = null

let rouletteTrackingToken = 0

function rouletteSectorColor(index) {
  return `hsl(${(index * 137.508) % 360} 62% 54%)`
}

function roulettePolarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function rouletteDescribeSector(cx, cy, r, startAngle, endAngle) {
  if (endAngle - startAngle >= 360) endAngle = startAngle + 359.99
  const start = roulettePolarToCartesian(cx, cy, r, endAngle)
  const end = roulettePolarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}

function rouletteLabelFits(name, sweepDeg) {
  const angularSpaceAtStart = ((sweepDeg * Math.PI) / 180) * ROULETTE_WHEEL_LABEL_INNER_RADIUS
  if (angularSpaceAtStart < ROULETTE_WHEEL_LABEL_FONT_SIZE + ROULETTE_WHEEL_LABEL_PADDING) return false
  const textWidth = name.length * ROULETTE_WHEEL_LABEL_FONT_SIZE * ROULETTE_WHEEL_LABEL_CHAR_WIDTH_RATIO
  return textWidth + ROULETTE_WHEEL_LABEL_PADDING <= ROULETTE_WHEEL_LABEL_OUTER_RADIUS - ROULETTE_WHEEL_LABEL_INNER_RADIUS
}

// Same formula as RouletteToolPage.tsx's own winner-positioning effect:
// finds the winning sector's angular midpoint, then picks the shortest
// forward rotation that parks it under the pointer (12 o'clock),
// plus a few extra full spins for a satisfying spin-up.
function computeRouletteWinnerRotation(entrants, winnerId, currentDeg) {
  const totalWeight = entrants.reduce((sum, entrant) => sum + entrant.weight, 0)
  let cursor = 0
  let winnerMid = 0
  for (const entrant of entrants) {
    const sweep = totalWeight > 0 ? (entrant.weight / totalWeight) * 360 : 0
    if (entrant.id === winnerId) {
      winnerMid = cursor + sweep / 2
      break
    }
    cursor += sweep
  }
  const currentMod = ((currentDeg % 360) + 360) % 360
  const delta = (360 - winnerMid - currentMod + 360) % 360
  return currentDeg + delta + ROULETTE_WHEEL_EXTRA_SPINS * 360
}

// What a Roulette Widget node renders — see NODE_SOCKETS.
// rouletteWidget/ROULETTE_WIDGET_OUTPUTS in components/nodes/
// constants.ts. Called only when rouletteWidgetVisible(...) is true
// (see buildContent's own dispatch) — this function itself doesn't
// gate on that. Reads the always-current `latestRouletteState` global
// (not `vars`), same reasoning as buildImage's forceAudioCover branch
// — this stays live with no Scene wiring needed beyond the mandatory
// `source` pairing. No own Width/Height field (same reasoning as
// buildImage/buildVideo above) — 240x240 here is only the fallback,
// it's always square regardless of which axis a Size modifier sets.
//
// Includes the same status badge RouletteToolPage.tsx shows above its
// own wheel: the countdown while 'collecting', whoever's CURRENTLY
// under the pointer while 'spinning' (tracked live, see the tick()
// loop below — NOT the true winner, which RouletteEngine already knows
// the instant the spin starts, well before it visually stops), and
// only the real winner once 'result'. Sector dimming (the
// opacity=0.4 fade on every non-winning slice) follows the exact same
// rule — only once `phase === 'result'` — so neither one spoils the
// outcome early.
function buildRouletteWheel(node, mods, animate, registry) {
  const wrap = document.createElement('div')
  wrap.className = 'roulette-wheel-node'
  wrap.style.width = '240px'
  applyModifierStyle(wrap, mods)
  // A Size modifier may have set only HEIGHT — the wheel is always
  // square and sized by WIDTH alone (see the aspect-ratio rule on
  // .roulette-wheel-svg below, which the badge sits above rather than
  // inside — a fixed wrap height would squash the two together), so
  // fall back to whichever axis actually got a value and always clear
  // height afterward so the column can size itself to badge + wheel.
  if (!wrap.style.width) wrap.style.width = wrap.style.height || '240px'
  wrap.style.height = ''

  const entrants = latestRouletteState.entrants || []
  const winnerId = (latestRouletteState.winner && latestRouletteState.winner.id) || null
  const phase = latestRouletteState.phase

  const badge = document.createElement('div')
  badge.className = 'roulette-wheel-badge'
  if (phase === 'idle' || entrants.length === 0) {
    badge.style.display = 'none'
  } else if (phase === 'collecting') {
    badge.textContent = latestRouletteState.endsAt ? formatRouletteCountdown((latestRouletteState.endsAt - Date.now()) / 1000) : ''
  } else if (phase === 'result') {
    badge.textContent = (latestRouletteState.winner && latestRouletteState.winner.name) || ''
  } else {
    // 'spinning': parked here until the tick() loop below starts
    // updating it with whoever's actually under the pointer.
    badge.textContent = ''
  }
  wrap.appendChild(badge)

  const svgBox = document.createElement('div')
  svgBox.className = 'roulette-wheel-svg'

  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('viewBox', '0 0 200 200')
  svg.style.width = '100%'
  svg.style.height = '100%'

  const group = document.createElementNS(svgNS, 'g')
  group.style.transformOrigin = '100px 100px'
  // See rouletteSpinFromDeg's own doc comment above for why this reads
  // (and clears) it instead of always just rouletteWheelRotationDeg.
  const fromDeg = rouletteSpinFromDeg
  rouletteSpinFromDeg = null
  group.style.transform = `rotate(${(fromDeg != null ? fromDeg : rouletteWheelRotationDeg)}deg)`

  // Populated below as each sector is built — reused by the tick()
  // pointer-tracking loop further down, same data tick() in
  // RouletteWheel.tsx's own React effect reads off its own `sectors`.
  const sectors = []
  if (entrants.length === 0) {
    const circle = document.createElementNS(svgNS, 'circle')
    circle.setAttribute('cx', '100')
    circle.setAttribute('cy', '100')
    circle.setAttribute('r', '92')
    circle.setAttribute('fill', '#27272a')
    circle.setAttribute('stroke', '#3f3f46')
    circle.setAttribute('stroke-width', '1')
    group.appendChild(circle)
  } else {
    const totalWeight = entrants.reduce((sum, entrant) => sum + entrant.weight, 0)
    let cursor = 0
    entrants.forEach((entrant, index) => {
      const sweep = totalWeight > 0 ? (entrant.weight / totalWeight) * 360 : 0
      const start = cursor
      const end = cursor + sweep
      cursor = end
      sectors.push({ entrant, start, end })
      const path = document.createElementNS(svgNS, 'path')
      path.setAttribute('d', rouletteDescribeSector(100, 100, 92, start, end))
      path.setAttribute('fill', rouletteSectorColor(index))
      path.setAttribute('stroke', '#18181b')
      path.setAttribute('stroke-width', '1.5')
      // Only dim non-winning sectors once the round has actually
      // landed — dimming (or not) during 'spinning' would itself give
      // the outcome away before the wheel visually stops.
      if (phase === 'result' && winnerId && entrant.id !== winnerId) path.setAttribute('opacity', '0.4')
      group.appendChild(path)
      if (rouletteLabelFits(entrant.name, end - start)) {
        const mid = (start + end) / 2
        const flip = mid > 180 && mid < 360
        const rotateAngle = flip ? mid - 270 : mid - 90
        const anchorX = flip ? 100 - ROULETTE_WHEEL_LABEL_INNER_RADIUS : 100 + ROULETTE_WHEEL_LABEL_INNER_RADIUS
        const text = document.createElementNS(svgNS, 'text')
        text.setAttribute('x', String(anchorX))
        text.setAttribute('y', '100')
        text.setAttribute('transform', `rotate(${rotateAngle} 100 100)`)
        text.setAttribute('text-anchor', flip ? 'end' : 'start')
        text.setAttribute('dominant-baseline', 'middle')
        text.setAttribute('font-size', String(ROULETTE_WHEEL_LABEL_FONT_SIZE))
        text.setAttribute('fill', '#ffffff')
        text.style.pointerEvents = 'none'
        text.textContent = entrant.name
        group.appendChild(text)
      }
    })
  }
  const outerCircle = document.createElementNS(svgNS, 'circle')
  outerCircle.setAttribute('cx', '100')
  outerCircle.setAttribute('cy', '100')
  outerCircle.setAttribute('r', '94')
  outerCircle.setAttribute('fill', 'none')
  outerCircle.setAttribute('stroke', '#ffffff')
  outerCircle.setAttribute('stroke-width', '2')
  group.appendChild(outerCircle)
  svg.appendChild(group)

  const pointer = document.createElementNS(svgNS, 'polygon')
  pointer.setAttribute('points', '100,4 91,21 109,21')
  pointer.setAttribute('fill', '#ffffff')
  pointer.setAttribute('stroke', '#000000')
  pointer.setAttribute('stroke-width', '1')
  pointer.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(pointer)

  const hub = document.createElementNS(svgNS, 'circle')
  hub.setAttribute('cx', '100')
  hub.setAttribute('cy', '100')
  hub.setAttribute('r', '9')
  hub.setAttribute('fill', '#18181b')
  hub.setAttribute('stroke', '#3f3f46')
  hub.setAttribute('stroke-width', '1.5')
  svg.appendChild(hub)

  svgBox.appendChild(svg)
  wrap.appendChild(svgBox)
  applyAnimation(wrap, mods, animate)
  if (registry) registry[node.id] = wrap

  // Spin-up: the group was just inserted parked at the OLD rotation
  // with no transition (so that state actually paints); deferring the
  // transition + new rotation to the next frame is what makes the
  // browser animate the change instead of jumping straight to it.
  if (fromDeg != null) {
    requestAnimationFrame(() => {
      group.style.transition = `transform ${ROULETTE_SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.72, 0.15, 1)`
      group.style.transform = `rotate(${rouletteWheelRotationDeg}deg)`
    })
  }

  // Live pointer tracking while spinning — exact port of
  // RouletteWheel.tsx's own tick() effect: reads the wheel's live CSS
  // transform (which keeps updating every frame during the CSS
  // transition triggered just above) each frame, works out which
  // sector is CURRENTLY under the 12-o'clock pointer, and updates the
  // badge to match. `rouletteTrackingToken` invalidates any PREVIOUS
  // loop (from a torn-down wheel) the instant a new one starts, so at
  // most one is ever running.
  rouletteTrackingToken += 1
  const myTrackingToken = rouletteTrackingToken
  if (rouletteTrackingRafId != null) cancelAnimationFrame(rouletteTrackingRafId)
  if (phase === 'spinning' && sectors.length > 0) {
    let lastName = null
    const tick = () => {
      if (rouletteTrackingToken !== myTrackingToken) return
      let angleDeg = 0
      const transform = window.getComputedStyle(group).transform
      if (transform && transform !== 'none') {
        try {
          const matrix = new DOMMatrixReadOnly(transform)
          angleDeg = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI
        } catch {
          angleDeg = 0
        }
      }
      const normalized = ((angleDeg % 360) + 360) % 360
      const pointerAngle = (360 - normalized) % 360
      const sector = sectors.find((s) => pointerAngle >= s.start && pointerAngle < s.end)
      const name = (sector && sector.entrant.name) || null
      if (name !== lastName) {
        lastName = name
        badge.textContent = name || ''
      }
      rouletteTrackingRafId = requestAnimationFrame(tick)
    }
    rouletteTrackingRafId = requestAnimationFrame(tick)
  } else {
    rouletteTrackingRafId = null
  }
  return wrap
}
