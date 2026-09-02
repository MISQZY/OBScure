// `#rrggbb` + an opacity percent -> `rgba(...)` — mirrors hexToRgba in
// SceneBuilderPage.tsx. For the Shadow node's color+opacity fields,
// which need an alpha channel a hex string alone can't carry.
function hexToRgba(hex, opacityPercent) {
  const clean = (hex || '#000000').replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) || 0
  const g = parseInt(clean.slice(2, 4), 16) || 0
  const b = parseInt(clean.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`
}

// A color field (Box's background/border, Text's color, Shadow's
// color, ...) is either a plain `#rrggbb` or a `linear-gradient(...)`
// CSS string from ColorPicker's Gradient tab — mirrors isGradientColor/
// gradientStopColors/backgroundLayer in lib/gradient.ts. Only ever
// needs to round-trip strings that ColorPicker itself produced (hex
// stops, always a `<n>%` position), same scope as the TS parser.
function isGradientColor(value) {
  return typeof value === 'string' && value.trim().startsWith('linear-gradient(')
}

function gradientStopColors(value) {
  const match = /^linear-gradient\(([\s\S]*)\)$/.exec(value.trim())
  if (!match) return []
  const parts = match[1].split(',').map((s) => s.trim()).filter(Boolean)
  const rest = /^-?\d+(\.\d+)?deg$/.test(parts[0]) ? parts.slice(1) : parts
  return rest.map((p) => p.split(/\s+/)[0])
}

// A solid or gradient color as one `background` layer, always as a
// background-image (never background-color) — the `background`
// shorthand only allows a plain color in its LAST layer, and the
// gradient-border trick (applyBorder below) needs the fill as a
// non-last layer.
function backgroundLayer(value, box) {
  const image = isGradientColor(value) ? value : `linear-gradient(${value}, ${value})`
  return `${image} ${box}`
}

// Mirrors shadowFilter in sceneUtils/style.ts — filter: drop-shadow()
// has no gradient equivalent, so a gradient color stacks one
// drop-shadow per stop (same offset/blur) as a soft multi-color glow.
function shadowFilter(color, opacityPercent, offsetX, offsetY, blur) {
  const colors = isGradientColor(color) ? gradientStopColors(color) : [color]
  return colors.map((c) => `drop-shadow(${offsetX}px ${offsetY}px ${blur}px ${hexToRgba(c, opacityPercent)})`).join(' ')
}

// Mirrors applyTextColor's counterpart, textColorStyle in
// sceneUtils/style.ts — `color` has no gradient equivalent, so a
// gradient value paints via background-clip: text instead.
function applyTextColor(el, value) {
  if (!isGradientColor(value)) {
    el.style.color = value
    return
  }
  el.style.backgroundImage = value
  el.style.webkitBackgroundClip = 'text'
  el.style.backgroundClip = 'text'
  el.style.color = 'transparent'
  el.style.webkitTextFillColor = 'transparent'
}

function applyModifierStyle(el, mods) {
  let transformStr = ''
  const transform = lastOfType(mods, 'transform')
  if (transform) {
    const d = transform.data || {}
    transformStr += `scale(${d.scaleX ?? 1}, ${d.scaleY ?? 1}) rotate(${d.rotation ?? 0}deg) `
  }
  
  const position = lastOfType(mods, 'position')
  if (position) {
    const d = position.data || {}
    const mode = d.mode || 'absolute'
    const anchor = d.anchor || 'top-left'
    const x = d.x ?? 0
    const y = d.y ?? 0

    if (mode === 'absolute') {
      el.style.position = 'absolute'
      if (anchor.includes('top')) el.style.top = `${y}px`
      if (anchor.includes('bottom')) el.style.bottom = `${y}px`
      if (anchor.includes('left')) el.style.left = `${x}px`
      if (anchor.includes('right')) el.style.right = `${x}px`
      
      if (anchor === 'center' || anchor === 'top-center' || anchor === 'bottom-center') {
        el.style.left = '50%'
        el.style.marginLeft = `${x}px`
        transformStr += 'translateX(-50%) '
      }
      if (anchor === 'center' || anchor === 'center-left' || anchor === 'center-right') {
        el.style.top = '50%'
        el.style.marginTop = `${y}px`
        transformStr += 'translateY(-50%) '
      }
    } else if (mode === 'relative') {
      transformStr += `translate(${x}px, ${y}px) `
    }
  }
  
  if (transformStr) {
    el.style.transform = transformStr.trim()
  }

  const size = lastOfType(mods, 'size')
  if (size) {
    const d = size.data || {}
    if (d.width != null) el.style.width = `${d.width}px`
    if (d.height != null) el.style.height = `${d.height}px`
  }

  const overflow = lastOfType(mods, 'overflow')
  if (overflow) {
    const d = overflow.data || {}
    if (d.overflowX) el.style.overflowX = d.overflowX
    if (d.overflowY) el.style.overflowY = d.overflowY
    // Auto-scroll's whole illusion depends on the scrolling axis
    // actually clipping (see applyAutoScrollContent's own doc
    // comment) — an axis left 'visible' just shows BOTH duplicated
    // copies fully unfolded with no windowing at all, which reads as
    // "doesn't scroll through properly, jumps around". Force it here
    // rather than trusting Overflow X/Y to already agree with it —
    // easy to flip Auto-scroll on without also remembering to set
    // that SAME axis's own Clip X/Y checkbox.
    if (d.autoScroll) {
      const scrollDirection = d.scrollDirection || 'up'
      if (scrollDirection === 'left' || scrollDirection === 'right') {
        if (!el.style.overflowX || el.style.overflowX === 'visible') el.style.overflowX = 'hidden'
      } else if (!el.style.overflowY || el.style.overflowY === 'visible') {
        el.style.overflowY = 'hidden'
      }
    }
  }

  const opacity = lastOfType(mods, 'opacity')
  if (opacity) {
    el.style.opacity = ((opacity.data && opacity.data.value) ?? 100) / 100
  }
  const shadow = lastOfType(mods, 'shadow')
  if (shadow) {
    const d = shadow.data || {}
    el.style.filter = shadowFilter(d.color || '#000000', d.opacity ?? 60, d.offsetX ?? 0, d.offsetY ?? 2, d.blur ?? 6)
  }
  // Hide — a manual on/off switch, mirrors modifierStyle in
  // SceneBuilderPage.tsx. Hidden (the default) unless its own Hidden
  // checkbox is off; flipping that and Saving updates it live, no
  // Play/Test needed — see HideNode's own doc comment in
  // components/nodes/index.tsx for how this differs from a Task's
  // show/hide.
  const hide = lastOfType(mods, 'hide')
  if (hide && (!hide.data || hide.data.hidden !== false)) {
    el.style.display = 'none'
  }
}

// Same borderEnabled/borderWidth/borderColor shape as Box's own fields
// — shared by buildImage/buildVideo/buildBox. Also sets `fill` as
// `el`'s background, since a gradient border needs `background` itself
// (no `border-color: <gradient>`) — see borderBoxStyle's own doc
// comment in sceneUtils/style.ts for the padding-box/border-box trick
// this mirrors.
function applyBorder(el, d, fill) {
  if (!d.borderEnabled) {
    el.style.background = fill
    return
  }
  const width = d.borderWidth ?? 2
  const color = d.borderColor || '#ffffff'
  if (isGradientColor(color)) {
    el.style.background = `${backgroundLayer(fill, 'padding-box')}, ${backgroundLayer(color, 'border-box')}`
    el.style.border = `${width}px solid transparent`
  } else {
    el.style.background = fill
    el.style.border = `${width}px solid ${color}`
  }
}

// A Box's corner treatment (see BOX_SHAPE_IDS' own doc comment in
// components/nodes/index.tsx) — mirrors boxShapeStyle in
// SceneBuilderPage.tsx.
function applyBoxShape(el, d) {
  const shape = d.shape || 'rectangle'
  if (shape === 'circle') {
    el.style.borderRadius = '50%'
  } else if (shape === 'pill') {
    el.style.borderRadius = '9999px'
  } else if (shape === 'hexagon') {
    el.style.borderRadius = '0px'
    el.style.clipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'
  } else if (shape === 'diamond') {
    el.style.borderRadius = '0px'
    el.style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'
  } else {
    el.style.borderRadius = `${d.borderRadius ?? 10}px`
  }
}

// Ordering modifier wired into a target (Box or Scene) — mirrors
// orderingClass in SceneBuilderPage.tsx, just returning a real
// flex-direction value instead of a Tailwind class name (applied as
// an inline style here, overriding the #scene/.box CSS's static
// "flex-direction: column" default).
function orderingFlexDirection(mods) {
  const ordering = mods.find((m) => m.type === 'ordering')
  if (!ordering) return 'column'
  const d = ordering.data || {}
  const layout = d.layout || 'vertical'
  const direction = d.direction || 'direct'
  if (layout === 'horizontal') return direction === 'revert' ? 'row-reverse' : 'row'
  return direction === 'revert' ? 'column-reverse' : 'column'
}

// Spacing (px) between a Box/Scene's children, from the same Ordering
// modifier orderingFlexDirection reads — mirrors orderingGap in
// SceneBuilderPage.tsx. 8px (the old hardcoded CSS value) when no
// Ordering node is wired, so every scene predating this field keeps
// its exact old spacing.
function orderingGap(mods) {
  const ordering = mods.find((m) => m.type === 'ordering')
  return (ordering && ordering.data && ordering.data.gap) ?? 8
}

// Which axis is the CROSS axis for a Box/Scene's children, given the
// same Ordering modifier orderingFlexDirection reads — 'vertical' for
// a horizontal/row layout, 'horizontal' for the default vertical/
// column one. Mirrors crossAxisFor in SceneBuilderPage.tsx; see
// buildText's own doc comment for what this is used for.
function crossAxisFor(mods) {
  const ordering = mods.find((m) => m.type === 'ordering')
  const layout = (ordering && ordering.data && ordering.data.layout) || 'vertical'
  return layout === 'horizontal' ? 'vertical' : 'horizontal'
}

// An Overflow modifier's `autoScroll` fields resolved into a render
// directive, or null when off/absent — mirrors overflowAutoScroll in
// pages/overlays/sceneUtils.tsx. `axis`/`reverse` pick which keyframe
// (ov-autoscroll-x/-y, in animations.css) and animation-direction to
// use. `speed` is px/second, NOT a fixed loop duration — see that
// function's own doc comment for why a fixed duration read as
// jerky/incomplete for a long entrants list (races through unreadably
// fast) while being too slow for a short one.
function overflowAutoScroll(mods) {
  const overflow = lastOfType(mods, 'overflow')
  if (!overflow || !overflow.data || !overflow.data.autoScroll) return null
  const direction = overflow.data.scrollDirection || 'up'
  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y'
  const reverse = direction === 'down' || direction === 'right'
  const speed = Math.max(5, overflow.data.scrollSpeed ?? 40)
  return { axis, speed, reverse }
}

// Appends `buildContent()`'s result into `el` directly, or — when
// `mods` carries an autoScroll Overflow modifier — twice back-to-back
// inside an animated track (ov-autoscroll-x/-y in animations.css), the
// standard seamless-marquee trick: translating the track by exactly
// -50% of its own size always lands on the SECOND copy's start, pixel-
// identical to the first copy's start (both copies are the same
// content), so the loop never visibly snaps. `flex-shrink: 0` on the
// track itself (not just the two copies) defends against the flexbox
// "min-height:auto" shrink trap — a flex item can otherwise be
// squeezed below its content size by a fixed-size ancestor with no
// visible symptom except silently-wrong content. `el` itself still
// needs its own overflow:hidden/auto — that's applyModifierStyle's
// job, already called by every caller of this.
//
// `scroll.speed` is px/second, so animation-duration is worked out
// from the FIRST copy's actual measured size, not guessed — a
// ResizeObserver (so it re-measures if content/fonts reflow after
// this first runs) rather than a one-shot getBoundingClientRect,
// since `first` isn't necessarily attached to the live document (and
// therefore has a real layout size) at the moment this function
// builds it — renderStatic appends the whole tree to #scene only
// after every buildX() call in it has already returned.
//
// Mirrors AutoScrollTrack in pages/overlays/views/index.tsx, except
// the second copy here is a cloneNode(true) of the first rather than
// a second independent build — cheaper, and avoids double-registering
// the same node id in `registry` — at the cost of the clone not
// reflecting a LATER in-place update (a Task retargeting this same
// node, a live Audio Player tick) until the next full scene rebuild.
// A cosmetic ticker combined with that kind of live per-node patching
// is a rare combination, so this trade-off is left undocumented
// anywhere but here.
//
// `nodeId` keys autoScrollState (see its own doc comment above) — a
// NEGATIVE animation-delay equal to how long this node's loop has
// already been running (mod one full loop) makes the freshly built
// track pick up exactly where the torn-down one left off, instead of
// restarting at 0% on every rebuild a live-data tick causes. The
// duration that modulo is taken against is pinned in that same state
// the first time it's measured, and only ever re-pinned when the
// measured size genuinely changes by a whole pixel — see
// autoScrollState's own doc comment for why re-deriving it fresh from
// every rebuild's own measurement (even though each one is "correct")
// was itself the bug: tiny inter-rebuild layout differences drifted
// the phase out of sync with what was actually on screen a moment
// before.
function applyAutoScrollContent(el, mods, buildContent, nodeId) {
  const scroll = overflowAutoScroll(mods)
  if (!scroll) {
    el.appendChild(buildContent())
    return
  }
  const track = document.createElement('div')
  track.style.display = 'flex'
  track.style.flexDirection = scroll.axis === 'x' ? 'row' : 'column'
  track.style.flexShrink = '0'
  track.style.willChange = 'transform'
  if (scroll.axis === 'x') track.style.width = 'max-content'
  const first = buildContent()
  first.style.flexShrink = '0'
  const second = first.cloneNode(true)
  track.appendChild(first)
  track.appendChild(second)
  el.appendChild(track)
  const setDuration = () => {
    const rect = first.getBoundingClientRect()
    const size = scroll.axis === 'x' ? rect.width : rect.height
    if (size <= 0) return
    const rounded = Math.round(size)
    let state = autoScrollState[nodeId]
    if (!state) {
      state = { startedAt: Date.now(), size: rounded, durationSec: rounded / scroll.speed }
      autoScrollState[nodeId] = state
    } else if (state.size !== rounded) {
      state.size = rounded
      state.durationSec = rounded / scroll.speed
    }
    const elapsedSec = (Date.now() - state.startedAt) / 1000
    const delaySec = -(elapsedSec % state.durationSec)
    track.style.animation = `ov-autoscroll-${scroll.axis} ${state.durationSec}s linear ${delaySec}s infinite${scroll.reverse ? ' reverse' : ''}`
  }
  if (window.ResizeObserver) {
    new ResizeObserver(setDuration).observe(first)
  } else {
    setDuration()
  }
}

// A Position modifier's own anchor (top-left/top-right/center/...) is
// meant to place a Text element's OWN box at that corner — but the
// `.text-node` CSS class defaults to width:100% (so Align has room to
// matter when centered/in a Box), which means the box already spans
// the full parent width regardless of which corner is picked, so
// every anchor ends up looking identical. Only once something has
// actually anchored it (position:absolute) AND no Size gives it a
// real width of its own does undoing that default back to the
// browser's native shrink-to-fit let the anchor actually differ. Runs
// after both buildText's own applyModifierStyle call and
// applyTaskStateToEl's re-application (a Task with its own Position
// moment) — reads the element's OWN resolved inline styles rather
// than being handed `mods`, so it works identically either way.
function fixAnchoredTextWidth(el) {
  if (el.classList.contains('text-node') && el.style.position === 'absolute' && !el.style.width) {
    el.style.width = 'auto'
  }
}

// An Animation modifier wired into a node — see the Duration field on
// that node's own form (components/nodes/index.tsx AnimationNode).
// Elements are freshly created here on every render(), so just setting
// data-animation + .visible up front is enough for the CSS keyframe
// (animations.css) to play — no need for the toggle-after-a-tick dance
// now-playing.html/alert.html use to REPLAY an animation on an element
// that's already on screen. Skipped entirely when `animate` is false
// (a silent content update — see render(overlay, animate)): the
// element just appears with no entrance transition instead of
// replaying one every time an unrelated field is saved.
function applyAnimation(el, mods, animate) {
  if (!animate) return
  const anim = lastOfType(mods, 'animation')
  if (!anim) return
  const d = anim.data || {}
  const type = d.type || 'fade'
  if (type === 'none') return
  el.dataset.animation = type
  if (d.duration) el.style.setProperty('--anim-duration', `${d.duration}ms`)
  el.classList.add('visible')
}

/**
 * One component's resolved state at time `atMs`, from every Task in
 * `schedule` targeting it — "last Task wins" for visibility, style
 * accumulates across all of them (most recent field wins, via
 * lastOfType on mods ordered OLDEST-first — same "last in the array
 * wins" convention every other lastOfType call uses).
 */
function computeTaskState(schedule, targetId, atMs, baseMods = []) {
  const mine = schedule.filter((s) => s.targetId === targetId && s.atMs <= atMs)
  const orderedMods = [...mine].sort((a, b) => a.atMs - b.atMs).flatMap((s) => s.mods)
  const style = {}

  const size = lastOfType(orderedMods, 'size')
  const baseSize = lastOfType(baseMods, 'size')
  if (size || baseSize) {
    const targetSize = size || baseSize
    if (targetSize.data.width != null) style.width = targetSize.data.width
    if (targetSize.data.height != null) style.height = targetSize.data.height
  }
  
  let transformStr = ''
  const transform = lastOfType(orderedMods, 'transform')
  const baseTransform = lastOfType(baseMods, 'transform')
  if (transform || baseTransform) {
    const bsx = baseTransform?.data?.scaleX ?? 1
    const bsy = baseTransform?.data?.scaleY ?? 1
    const brot = baseTransform?.data?.rotation ?? 0
    if (transform) {
      const tsx = transform.data.scaleX ?? 1
      const tsy = transform.data.scaleY ?? 1
      const trot = transform.data.rotation ?? 0
      transformStr += `scale(${bsx * tsx}, ${bsy * tsy}) rotate(${brot + trot}deg) `
    } else {
      transformStr += `scale(${bsx}, ${bsy}) rotate(${brot}deg) `
    }
  }

  const position = lastOfType(orderedMods, 'position')
  const basePosition = lastOfType(baseMods, 'position')
  if (position || basePosition) {
    const bx = basePosition?.data?.x ?? 0
    const by = basePosition?.data?.y ?? 0
    let x = bx
    let y = by
    if (position) {
      if (position.data.x != null || basePosition) x = bx + (position.data.x ?? 0)
      if (position.data.y != null || basePosition) y = by + (position.data.y ?? 0)
    }
    
    const targetPos = position || basePosition
    const mode = targetPos?.data?.mode || 'absolute'
    const anchor = targetPos?.data?.anchor || 'top-left'

    if (mode === 'absolute') {
      style.position = 'absolute'
      if (anchor.includes('top')) style.top = `${y}px`
      if (anchor.includes('bottom')) style.bottom = `${y}px`
      if (anchor.includes('left')) style.left = `${x}px`
      if (anchor.includes('right')) style.right = `${x}px`
      
      if (anchor === 'center' || anchor === 'top-center' || anchor === 'bottom-center') {
        style.left = '50%'
        style.marginLeft = `${x}px`
        transformStr += 'translateX(-50%) '
      }
      if (anchor === 'center' || anchor === 'center-left' || anchor === 'center-right') {
        style.top = '50%'
        style.marginTop = `${y}px`
        transformStr += 'translateY(-50%) '
      }
    } else if (mode === 'relative') {
      transformStr += `translate(${x}px, ${y}px) `
    }
  }
  
  if (transformStr) {
    style.transform = transformStr.trim()
  }
  
  const opacity = lastOfType(orderedMods, 'opacity')
  const baseOpacity = lastOfType(baseMods, 'opacity')
  if (opacity || baseOpacity) {
    const bOp = baseOpacity?.data?.value ?? 100
    if (opacity) {
      const tOp = opacity.data.value ?? 100
      style.opacity = (bOp / 100) * (tOp / 100)
    } else {
      style.opacity = bOp / 100
    }
  }
  
  const shadow = lastOfType(orderedMods, 'shadow')
  if (shadow) {
    const d = shadow.data || {}
    style.filter = shadowFilter(d.color || '#000000', d.opacity ?? 60, d.offsetX ?? 0, d.offsetY ?? 2, d.blur ?? 6)
  } else {
    const baseShadow = lastOfType(baseMods, 'shadow')
    if (baseShadow) {
      const d = baseShadow.data || {}
      style.filter = shadowFilter(d.color || '#000000', d.opacity ?? 60, d.offsetX ?? 0, d.offsetY ?? 2, d.blur ?? 6)
    }
  }

  const showHide = [...mine].filter((s) => s.action === 'show' || s.action === 'hide').sort((a, b) => b.atMs - a.atMs)[0]
  let visible = false
  let anim = null
  let hiding = false
  if (showHide) {
    const animMod = lastOfType(showHide.mods, 'animation')
    const animType = animMod ? animMod.data.type || 'fade' : 'none'
    const duration = animMod ? animMod.data.duration || (animType === 'slide' ? 300 : animType === 'bounce' ? 500 : 250) : 0
    const withinAnim = animType !== 'none' && atMs - showHide.atMs < duration
    visible = showHide.action === 'show' || withinAnim
    if (withinAnim) {
      anim = { type: animType, duration }
      // Sub-type field on the Animation node ('in'/'out'/'auto') — 'auto'
      // (or unset, pre-existing scenes) falls back to the Task's own
      // show/hide action, same as before this field existed.
      const subType = animMod && (animMod.data.subType === 'in' || animMod.data.subType === 'out') ? animMod.data.subType : null
      hiding = subType ? subType === 'out' : showHide.action === 'hide'
    }
  }

  return { visible, style, anim, hiding }
}

// Applies one computeTaskState result to an already-built element —
// the process equivalent of applyModifierStyle+applyAnimation, which
// only ever run once at build time and can't be re-invoked later.
function applyTaskStateToEl(el, state, baseMods) {
  el.style.display = state.visible ? '' : 'none'
  el.style.position = ''
  el.style.left = ''
  el.style.right = ''
  el.style.top = ''
  el.style.bottom = ''
  el.style.marginLeft = ''
  el.style.marginTop = ''
  el.style.width = ''
  el.style.height = ''
  el.style.transform = ''
  el.style.opacity = ''
  el.style.filter = ''
  
  if (baseMods) applyModifierStyle(el, baseMods)
  
  if (!state.visible) return
  if (state.style.position) el.style.position = state.style.position
  if (state.style.left != null) el.style.left = state.style.left
  if (state.style.right != null) el.style.right = state.style.right
  if (state.style.top != null) el.style.top = state.style.top
  if (state.style.bottom != null) el.style.bottom = state.style.bottom
  if (state.style.marginLeft != null) el.style.marginLeft = state.style.marginLeft
  if (state.style.marginTop != null) el.style.marginTop = state.style.marginTop
  if (state.style.width != null) el.style.width = `${state.style.width}px`
  if (state.style.height != null) el.style.height = `${state.style.height}px`
  if (state.style.transform) el.style.transform = state.style.transform
  if (state.style.opacity != null) el.style.opacity = state.style.opacity
  if (state.style.filter) el.style.filter = state.style.filter
  fixAnchoredTextWidth(el)
  if (state.anim) {
    el.dataset.animation = state.anim.type
    el.style.setProperty('--anim-duration', `${state.anim.duration}ms`)
    el.classList.add('visible')
    el.classList.toggle('hiding', state.hiding)
  } else {
    el.classList.remove('visible', 'hiding')
  }
}

/**
 * How much EXTRA time (ms) beyond totalMs is needed before it's safe
 * to actually tear the scene down — the process equivalent of
 * maxExitDurationMs/playExitAnimations in SceneBuilderPage.tsx/this
 * file. Without this, the LAST wave of Tasks (whichever fire at
 * exactly totalMs, the schedule's own final moment) has its
 * animation cut off before a single frame plays: showProcessContent
 * used to tear the DOM down at totalMs itself, the SAME instant those
 * Tasks' entrance/exit animation would just be starting.
 *
 * Checks EVERY Task, not just ones exactly at totalMs: a Task earlier
 * in the chain (typically a `hide`) still needs its own atMs +
 * duration to fit before the run ends, same as a final-wave one — a
 * short Wait right after it doesn't guarantee that on its own (e.g. a
 * 250ms Wait following an 800ms exit animation used to let the scene
 * tear down 550ms before that Task's own Animation had actually
 * finished, cutting it off mid-play instead of hiding only once it's
 * done).
 */
function processExitBufferMs(schedule, totalMs) {
  let latestEndMs = totalMs
  for (const s of schedule) {
    const anim = lastOfType(s.mods, 'animation')
    if (!anim) continue
    const type = anim.data.type || 'fade'
    if (type === 'none') continue
    const duration = anim.data.duration || (type === 'slide' ? 300 : type === 'bounce' ? 500 : 250)
    const endMs = s.atMs + duration
    if (endMs > latestEndMs) latestEndMs = endMs
  }
  return latestEndMs - totalMs
}
