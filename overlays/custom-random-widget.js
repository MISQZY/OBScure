// Same "armed for exactly one render pass" shape as rouletteSpinFromDeg
// above, set by the 'random-state' WS handler the instant a roll
// transitions into 'revealed' — buildRandomWidget reads and
// immediately clears it, so an unrelated re-render doesn't replay the
// slot machine's roll-in.
let randomRevealArmed = false

// --- Random slot machine widget ---------------------------------------
// Ports the CSS-transition roll from pages/tools/RandomSlotMachine.tsx
// (itself a port of the strip-prefilled-then-settles trick
// RandomToolPage.tsx's own SlotMachineNumber originated) to plain DOM.

// One rolling digit box. `animate` plays the roll (prefills a strip of
// random numbers above the target, parked with no transition, then
// defers a slow settling transition to the next two frames — same
// two-frame "let the start state paint first" trick
// buildRouletteWheel's own spin-up above uses); false just renders
// `targetNumber` at rest. `scale` resizes the box/font proportionally,
// 1 matching RandomSlotMachine.tsx's own fixed 54px/text-3xl baseline.
function buildRandomSlotNumber(targetNumber, min, max, animate, stopDelayMs, scale) {
  const box = document.createElement('div')
  box.className = 'random-slot-box'
  const maxChars = Math.max(String(min).length, String(max).length)
  const boxHeight = 54 * scale
  box.style.width = `calc(${maxChars}ch + ${1.25 * scale}rem)`
  box.style.height = `${boxHeight}px`
  box.style.paddingLeft = `${10 * scale}px`
  box.style.paddingRight = `${10 * scale}px`
  box.style.fontSize = `${30 * scale}px`

  const track = document.createElement('div')
  track.className = 'random-slot-track'
  const strip = [targetNumber]
  if (animate) {
    for (let i = 0; i < 40; i++) strip.push(min + Math.floor(Math.random() * (max - min + 1)))
  }
  for (const n of strip) {
    const cell = document.createElement('div')
    cell.className = 'random-slot-cell'
    cell.style.height = `${boxHeight}px`
    cell.textContent = String(n)
    track.appendChild(cell)
  }
  box.appendChild(track)

  if (animate) {
    track.style.transform = `translateY(-${(strip.length - 1) * boxHeight}px)`
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        track.style.transitionProperty = 'transform'
        track.style.transitionDuration = `${stopDelayMs}ms`
        track.style.transitionTimingFunction = 'cubic-bezier(0.15, 0.85, 0.35, 1)'
        track.style.transform = 'translateY(0)'
      })
    })
  } else {
    track.style.transform = 'translateY(0)'
  }
  return box
}

// A Random Widget's own Ordering wire resolved into a raw flex
// direction/gap — mirrors randomWidgetOrdering in
// pages/overlays/sceneUtils.tsx (own doc comment there covers why its
// un-wired default is a ROW, unlike orderingFlexDirection/orderingGap
// above's own column/8 default for Box/Scene).
function randomWidgetOrdering(mods) {
  const ordering = mods.find((m) => m.type === 'ordering')
  if (!ordering) return { flexDirection: 'row', gap: 12 }
  const d = ordering.data || {}
  const layout = d.layout || 'vertical'
  const direction = d.direction || 'direct'
  const flexDirection = layout === 'horizontal' ? (direction === 'revert' ? 'row-reverse' : 'row') : direction === 'revert' ? 'column-reverse' : 'column'
  return { flexDirection, gap: d.gap ?? 8 }
}

// What a Random Widget node itself renders — see NODE_SOCKETS.
// randomWidget/RANDOM_WIDGET_OUTPUTS in components/nodes/constants.ts.
// Called only when randomWidgetVisible(...) is true (see buildContent's
// own dispatch) — this function itself doesn't gate on that. Reads the
// always-current `latestRandomState` global, same reasoning as
// buildRouletteWheel above. No own Width/Height field — 320 here is
// only the fallback SCALE reference (RandomSlotMachine.tsx's own
// baseline), not a clipping box: unlike Roulette's fixed-square wheel,
// a slot machine's natural width already depends on how many
// digits/numbers there are, so a Size modifier resizes the boxes
// rather than constraining the wrap.
//
// Renders nothing while 'idle'/'committed' (no numbers to show yet —
// {hash} is still available to a Text wired to this Random's own
// Result node even then) — only 'revealed' has anything to roll.
// `randomRevealArmed` (see its own doc comment above) plays the roll-in
// for exactly the render pass right after a reveal; every later
// render of the same revealed state shows the settled numbers as-is.
function buildRandomWidget(node, mods, animate, registry) {
  const wrap = document.createElement('div')
  wrap.className = 'random-widget-node'
  applyModifierStyle(wrap, mods)
  const sizeRaw = parseFloat(wrap.style.width) || parseFloat(wrap.style.height) || 320
  wrap.style.width = ''
  wrap.style.height = ''
  const scale = sizeRaw / 320
  const { flexDirection, gap } = randomWidgetOrdering(mods)
  wrap.style.flexDirection = flexDirection
  wrap.style.flexWrap = flexDirection === 'row' || flexDirection === 'row-reverse' ? 'wrap' : 'nowrap'
  wrap.style.gap = `${gap * scale}px`

  const revealArmed = randomRevealArmed
  randomRevealArmed = false
  const numbers = latestRandomState.numbers || []
  if (latestRandomState.phase === 'revealed' && numbers.length > 0) {
    numbers.forEach((n, i) => {
      wrap.appendChild(buildRandomSlotNumber(n, latestRandomState.min, latestRandomState.max, revealArmed, 1500 + i * 400, scale))
    })
  }
  applyAnimation(wrap, mods, animate)
  if (registry) registry[node.id] = wrap
  return wrap
}
