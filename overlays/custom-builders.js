// `registry`, when given, records every built element by its node id
// (registry[node.id] = el) — used by showTimelineContent to find each
// component's DOM element again later when a cue fires, since buildBox
// otherwise owns its children's elements with no external handle to them.
//
// `crossAxis` (from crossAxisFor, computed by the caller off the
// parent Box/Scene's own Ordering) is 'horizontal' or 'vertical' — the
// CSS axis flexbox's align-items:center (the parent's fixed cross-axis
// rule, #scene/.box) actually leaves room along. The `.text-node` CSS
// class defaults to width:100% so Align has room to matter, but that
// only gives HORIZONTAL room — height is never set, so Vertical never
// has any room at all as a flex sibling. Align/Vertical only stretch
// this element (align-self) along whichever axis is the CROSS axis
// AND that field was actually changed from its default — never for
// the default left/top, so a Text using default settings renders
// pixel-identical to before this existed. Skipped when the caller
// never wired an Ordering-bearing parent (`crossAxis` omitted — the
// legacy pre-Scene fallback below).
// Text elements currently showing a live `{time}` placeholder (see
// clockFormatFor in custom-content-values.js) — one shared 1s interval (not
// one per node) recomputes each one's actual displayed text fresh against a
// new `new Date()`, started lazily on the first such Text and stopped once
// none are left, self-pruning via `span.isConnected` on every tick — same
// pattern the old buildClock/clockElements/tickClocks used before Clock
// itself stopped being independently rendered (see CLOCK_OUTPUTS' own doc
// comment in components/nodes/constants.ts). Mirrors TextView.tsx's own
// per-instance useEffect tick — there, each Text component's own React
// state naturally isolates this; here, with no component lifecycle, one
// shared interval covers every instance the same way.
let textClockElements = []
let textClockTickIntervalId = null

function tickTextClocks() {
  textClockElements = textClockElements.filter(({ span }) => span.isConnected)
  if (textClockElements.length === 0) {
    clearInterval(textClockTickIntervalId)
    textClockTickIntervalId = null
    return
  }
  const now = new Date()
  for (const entry of textClockElements) {
    // replaceText (Roulette Entrants) always wins outright, same as the
    // initial build below — never ticks, just keeps agreeing with it.
    if (entry.replaceText != null) continue
    const merged = { ...entry.contentValues, time: formatClockDate(now, entry.format) }
    entry.span.textContent = interpolate(entry.node.data.text ?? '', entry.vars ? { ...entry.vars, ...merged } : merged)
  }
}

function buildText(node, mods, animate, vars, registry, crossAxis, contentValues, replaceText, clockFormat) {
  const d = node.data || {}
  const el = document.createElement('div')
  el.className = 'text-node'
  // Roulette Entrants' Content output REPLACES the template outright
  // (see rouletteEntrantsTextValue above) — unlike contentValues
  // below, which only ever supplies values a template still
  // interpolates. Mirrors ImageNode's own read-only-URL priority for
  // Audio Player's Content wire (see buildImage). Content still
  // interpolates the SAME placeholder template it always has —
  // contentValues (audioContentValues' own {artist}/{title}) just adds
  // whichever of those is actually wired in to whatever vars this
  // render already carries, so a template like "{user}: {artist} —
  // {title}" keeps working whether that data comes from an
  // Event/Audio-Player-triggered Scene's vars, a direct Content wire,
  // or (typically) not at all. clockFormat (from clockFormatFor) adds
  // {time} the same way, just recomputed fresh every second afterward —
  // see tickTextClocks above.
  const mergedValues = clockFormat ? { ...contentValues, time: formatClockDate(new Date(), clockFormat) } : contentValues
  const text = replaceText != null ? replaceText : interpolate(d.text ?? '', mergedValues ? { ...vars, ...mergedValues } : vars)
  let leafSpan = null
  applyAutoScrollContent(el, mods, () => {
    const span = document.createElement('span')
    span.textContent = text
    leafSpan = span
    return span
  }, node.id)
  if (clockFormat && leafSpan) {
    textClockElements.push({ span: leafSpan, node, vars, contentValues, replaceText, format: clockFormat })
    if (textClockTickIntervalId == null) textClockTickIntervalId = setInterval(tickTextClocks, 1000)
  }
  applyTextColor(el, d.color || '#ffffff')
  const align = d.align || 'left'
  const verticalAlign = d.verticalAlign || 'top'
  el.style.textAlign = align
  if (d.fontFamily) el.style.fontFamily = `"${d.fontFamily}"`
  // bold defaults true (d.bold !== false) — font-weight:700 used to be
  // the class's own unconditional rule; every pre-existing Text node
  // must keep rendering bold unless explicitly turned off now that
  // it's a field. italic has no such history — false is both the
  // default and what "never set" already meant.
  el.style.fontWeight = d.bold === false ? '400' : '700'
  el.style.fontStyle = d.italic ? 'italic' : 'normal'
  el.style.letterSpacing = `${d.letterSpacing ?? 0}px`
  if (d.lineHeight != null) el.style.lineHeight = d.lineHeight
  if (d.fontSize) el.style.fontSize = `${d.fontSize}px`
  // Auto-scroll's keyframes (ov-autoscroll-y) assume the track starts
  // flush against this element's OWN top edge — translateY(0) IS "show
  // the very top of copy1". Vertical/'middle' or 'bottom' instead
  // CENTERS/bottom-aligns the (always taller, by design) track within
  // this box before the animation ever runs, offsetting that starting
  // point by however much the track overflows — which silently breaks
  // the translateY(0)->(-50%) math (derived assuming a flex-start base
  // position), showing an arbitrary slice of the middle of the list
  // and skipping the rest on each loop instead of sweeping through all
  // of it. Vertical Align is about placing SHORT, non-overflowing
  // content within its box — meaningless once autoScroll guarantees
  // the content always overflows, so it's skipped here rather than
  // fought elsewhere.
  if (!overflowAutoScroll(mods)) {
    if (verticalAlign === 'middle') el.style.justifyContent = 'center'
    else if (verticalAlign === 'bottom') el.style.justifyContent = 'flex-end'
  }
  if ((crossAxis === 'horizontal' && align !== 'left') || (crossAxis === 'vertical' && verticalAlign !== 'top')) {
    el.style.alignSelf = 'stretch'
  }
  applyModifierStyle(el, mods)
  fixAnchoredTextWidth(el)
  applyAnimation(el, mods, animate)
  if (registry) registry[node.id] = el
  return el
}

function buildImage(node, mods, animate, vars, registry, forceAudioCover) {
  const d = node.data || {}
  const wrap = document.createElement('div')
  wrap.className = 'image-node'
  // No own Width/Height field (see ImageNode's own doc comment in
  // components/nodes/index.tsx) — 96x96 here is only the fallback;
  // applyModifierStyle below overrides it when a Size node is wired.
  wrap.style.width = '96px'
  wrap.style.height = '96px'
  wrap.style.borderRadius = `${d.borderRadius ?? 8}px`
  applyBorder(wrap, d, 'rgba(255, 255, 255, 0.08)')
  // An explicit Content wire (forceAudioCover, from Audio Player's own
  // Content output into this node's Content socket — see hasAudioCover/
  // AUDIO_PLAYER_OUTPUTS in components/nodes/index.tsx) takes priority
  // over a set custom image/URL, unlike the passive empty-URL fallback
  // below — and, like audioContentValues, reads the always-current
  // `latestNowPlaying` global rather than `vars`, so it stays live with
  // no Scene wiring needed (see hasAudioContentDeps). Otherwise: an
  // uploaded custom-images file takes priority over the URL field (see
  // ImageNode's own doc comment in components/nodes/index.tsx) — a
  // relative path resolves correctly since this page is itself served
  // from /overlays/, unlike the React preview (ImageView), which needs
  // the full http://host:port URL instead. Neither set: fall back to
  // the live now-playing album art, if this render has one (only true
  // for an Audio-Player-driven scene — see showAudioContent) — mirrors
  // "Leave empty for album art" on ImageNode's own URL field.
  const imageSrc = forceAudioCover
    ? latestNowPlaying.albumArt || null
    : d.customImageName
      ? `custom-images/${encodeURIComponent(d.customImageName)}`
      : d.src || (vars && vars.albumArt) || null
  // 'repeat' has no object-fit equivalent (no tiling keyword), so it's
  // rendered as a tiled CSS background instead of an <img> — mirrors
  // ImageView.tsx. The rest map straight onto object-fit, overriding
  // the '#scene .image-node img' CSS rule's object-fit: cover default.
  const fit = d.fit || 'cover'
  if (imageSrc) {
    if (fit === 'repeat') {
      // Quoted + escaped, same reasoning as ImageView.tsx — an
      // unquoted url(...) truncates at the first literal ')'.
      wrap.style.backgroundImage = `url("${imageSrc.replace(/["\\]/g, '\\$&')}")`
      wrap.style.backgroundRepeat = 'repeat'
    } else {
      const img = document.createElement('img')
      img.src = imageSrc
      img.style.objectFit = fit
      wrap.appendChild(img)
    }
  }
  applyModifierStyle(wrap, mods)
  applyAnimation(wrap, mods, animate)
  if (registry) registry[node.id] = wrap
  return wrap
}

function buildVideo(node, mods, animate, registry) {
  const d = node.data || {}
  const wrap = document.createElement('div')
  wrap.className = 'image-node'
  // No own Width/Height field, same reasoning as buildImage above.
  wrap.style.width = '320px'
  wrap.style.height = '180px'
  wrap.style.borderRadius = `${d.borderRadius ?? 8}px`
  applyBorder(wrap, d, 'rgba(255, 255, 255, 0.08)')
  if (d.src) {
    const video = document.createElement('video')
    video.src = d.src
    video.autoplay = true
    // Muted by default (d.muted !== false) — browsers, OBS's Browser
    // Source included, block unmuted autoplay outright, so an
    // unexpectedly-silent clip is the safer failure mode than one
    // that never plays at all. See VideoNode's own doc comment in
    // components/nodes/index.tsx — a Sound node alongside it is the
    // reliable way to get audio out of a video-driven alert.
    video.muted = d.muted !== false
    video.loop = d.loop !== false
    video.playsInline = true
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'cover'
    wrap.appendChild(video)
  }
  applyModifierStyle(wrap, mods)
  applyAnimation(wrap, mods, animate)
  if (registry) registry[node.id] = wrap
  return wrap
}

// current/target clamped to a 0-100 fill percent — mirrors progressPercent
// in ProgressView.tsx. 0 when target isn't positive (no divide-by-zero/
// negative-width fill).
function progressPercent(current, target) {
  if (!(target > 0)) return 0
  return Math.max(0, Math.min(100, (current / target) * 100))
}

function buildProgress(node, edges, map, mods, animate, registry) {
  const d = node.data || {}
  const orientation = d.orientation === 'vertical' ? 'vertical' : 'horizontal'
  const current = progressSourceValue(node.id, 'current', edges, map)
  const target = progressSourceValue(node.id, 'target', edges, map)
  const percent = progressPercent(current, target)
  const thickness = d.thickness ?? 28
  const radius = d.borderRadius ?? 14

  const wrap = document.createElement('div')
  wrap.className = 'progress-node'
  wrap.style.position = 'relative'
  wrap.style.width = orientation === 'horizontal' ? '240px' : `${thickness}px`
  wrap.style.height = orientation === 'horizontal' ? `${thickness}px` : '240px'
  wrap.style.borderRadius = `${radius}px`
  wrap.style.overflow = 'hidden'
  wrap.style.background = d.trackColor || '#3f3f46'
  wrap.style.flexShrink = '0'

  const fill = document.createElement('div')
  fill.style.position = 'absolute'
  fill.style.left = '0'
  fill.style.bottom = '0'
  fill.style.background = d.barColor || '#8b5cf6'
  fill.style.transition = 'width 300ms ease, height 300ms ease'
  if (orientation === 'horizontal') {
    fill.style.top = '0'
    fill.style.width = `${percent}%`
    fill.style.height = '100%'
  } else {
    fill.style.right = '0'
    fill.style.width = '100%'
    fill.style.height = `${percent}%`
  }
  wrap.appendChild(fill)

  // Label is a wired Text node (unambiguous by type in `mods` — 'text' only
  // ever lands on Progress's own `label` socket), rendered with THAT node's
  // own full styling via buildText itself rather than reading only its
  // `.data.text` the way applyBackgroundFx's caption does — mirrors
  // ProgressView.tsx. mods=[] (no Transform/Style of its own; it's centered
  // by the wrapper below, not independently positioned) and no registry (not
  // independently selectable/targetable — same reasoning Roulette
  // Entrants' own Content wire isn't registered either).
  const labelNode = mods.find((n) => n.type === 'text')
  if (labelNode) {
    const labelWrap = document.createElement('div')
    labelWrap.style.position = 'absolute'
    labelWrap.style.inset = '0'
    labelWrap.style.display = 'flex'
    labelWrap.style.alignItems = 'center'
    labelWrap.style.justifyContent = 'center'
    labelWrap.style.pointerEvents = 'none'
    const contentValues = {
      ...variablePlaceholderValues(Object.values(map)),
      current: String(current),
      target: String(target),
      percent: String(Math.round(percent))
    }
    labelWrap.appendChild(buildText(labelNode, [], animate, undefined, undefined, 'horizontal', contentValues, null, clockFormatFor(labelNode.id, edges, map)))
    wrap.appendChild(labelWrap)
  }

  applyModifierStyle(wrap, mods)
  applyAnimation(wrap, mods, animate)
  if (registry) registry[node.id] = wrap
  return wrap
}

// Mirrors formatClockDate in components/nodes/utils/constants.ts — kept
// deliberately tiny (no locale month/weekday names) since this only ever
// needs to reproduce that file's own fixed CLOCK_FORMAT_IDS preset list.
function formatClockDate(date, format) {
  const pad = (n) => String(n).padStart(2, '0')
  const hours24 = date.getHours()
  const hours12raw = hours24 % 12
  const hours12 = hours12raw === 0 ? 12 : hours12raw
  const tokens = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(hours24),
    hh: pad(hours12),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    A: hours24 < 12 ? 'AM' : 'PM'
  }
  return format.replace(/YYYY|MM|DD|HH|hh|mm|ss|A/g, (token) => tokens[token])
}


// `crossAxis` — see buildText's own doc comment — is the CROSS axis of
// whichever Box/Scene THIS node is a direct child of (crossAxisFor,
// computed once by the caller off ITS OWN Ordering); only buildText
// reads it. buildBox ignores it (Box has no Align/Vertical of its
// own) and instead computes a FRESH one off its own Ordering for ITS
// OWN children below.
function buildContent(node, edges, map, animate, vars, registry, depth = 0, crossAxis) {
  const mods = incoming(node.id, edges, map)
  if (node.type === 'text') {
    // Audio Player and Random can both feed the same Text's Content
    // socket at once (it's `multi: true`) — each only ever SUPPLIES
    // placeholder values, never replaces the template, so merging
    // them is exactly what wiring both in means.
    const audioValues = audioContentValues(node.id, edges, map)
    const randomValues = randomContentValues(node.id, edges, map)
    // variableValues isn't gated by any wiring at all — every Variable node
    // ANYWHERE in the scene registers its own `{name}` placeholder just by
    // existing (see variablePlaceholderValues' own doc comment), same
    // "available without wiring" convention EVENT_PLACEHOLDERS uses.
    const variableValues = variablePlaceholderValues(Object.values(map))
    const hasVariableValues = Object.keys(variableValues).length > 0
    const contentValues = audioValues || randomValues || hasVariableValues ? { ...variableValues, ...audioValues, ...randomValues } : null
    // Different from the three above: not a value resolved once here, just
    // a Format string — see clockFormatFor's own doc comment for why
    // buildText needs to own the actual {time} computation (and its own 1s
    // tick, via textClockElements/tickTextClocks) itself.
    const clockFormat = clockFormatFor(node.id, edges, map)
    const replaceText = rouletteEntrantsTextValue(node.id, edges, map)
    return buildText(node, mods, animate, vars, registry, crossAxis, contentValues, replaceText, clockFormat)
  }
  if (node.type === 'image') return buildImage(node, mods, animate, vars, registry, hasAudioCover(node.id, edges, map))
  if (node.type === 'video') return buildVideo(node, mods, animate, registry)
  if (node.type === 'progress') return buildProgress(node, edges, map, mods, animate, registry)
  if (node.type === 'rouletteWidget') return rouletteWidgetVisible(node.id, edges, map) ? buildRouletteWheel(node, mods, animate, registry) : null
  if (node.type === 'randomWidget') return randomWidgetVisible(node.id, edges, map) ? buildRandomWidget(node, mods, animate, registry) : null
  // Resolves to exactly ONE of its own wired options (see
  // pickRandomVariant above) and delegates straight back into
  // buildContent for THAT node — same depth cap as Box/Group below
  // since a Random Pick can nest another one as one of its own
  // options.
  if (node.type === 'randomPick') {
    if (depth >= MAX_BOX_DEPTH) return null
    const picked = pickRandomVariant(node, edges, map)
    return picked ? buildContent(picked, edges, map, animate, vars, registry, depth + 1, crossAxis) : null
  }
  // A nested Box or Group (see BOX_SOCKETS' own doc comment in
  // components/nodes/index.tsx) — buildBox is defined below but
  // function declarations are hoisted, so this forward reference
  // resolves fine; buildBox calls back into buildContent for ITS OWN
  // children, so this recurses to whatever depth the graph nests. It
  // handles both node types identically except for Box's own
  // decorative styling.
  if (node.type === 'box' || node.type === 'group') return buildBox(node, edges, map, animate, vars, registry, depth + 1)
  return null
}

function buildBox(node, edges, map, animate, vars, registry, depth = 0) {
  const isBox = node.type === 'box'
  const incomingNodes = incoming(node.id, edges, map)
  const children =
    depth >= MAX_BOX_DEPTH
      ? []
      : incomingNodes.filter(
          (n) =>
            n.type === 'text' ||
            n.type === 'image' ||
            n.type === 'video' ||
            n.type === 'progress' ||
            n.type === 'box' ||
            n.type === 'group' ||
            n.type === 'randomPick' ||
            n.type === 'rouletteWidget' ||
            n.type === 'randomWidget'
        )
  const childCrossAxis = crossAxisFor(incomingNodes)
  const d = node.data || {}
  const container = document.createElement('div')
  container.className = isBox ? 'box' : 'group'
  // Group (see GroupNode's own doc comment in components/nodes/
  // index.tsx) skips all of these — it's an invisible wrapper, not a
  // card.
  if (isBox) {
    // Legacy fallback only, for a Box saved before Spacing existed (see
    // NODE_DEFAULTS.box's own doc comment in components/nodes/constants.ts)
    // — applyModifierStyle below runs AFTER this and sets el.style.padding
    // itself whenever a Spacing node is actually wired in, taking priority
    // over whatever's set here, same "wire always wins" precedence
    // BoxView's own doc comment describes for the React side.
    if (d.paddingX != null || d.paddingY != null) {
      container.style.padding = `${d.paddingY ?? 12}px ${d.paddingX ?? 16}px`
    }
    applyBoxShape(container, d)
    applyBorder(container, d, d.background || '#18181b')
  }
  container.style.position = 'relative'
  container.style.flexDirection = orderingFlexDirection(incomingNodes)
  container.style.gap = `${orderingGap(incomingNodes)}px`
  applyModifierStyle(container, incomingNodes)
  applyAnimation(container, incomingNodes, animate)
  if (registry) registry[node.id] = container
  for (const child of children) {
    const childEl = buildContent(child, edges, map, animate, vars, registry, depth, childCrossAxis)
    if (childEl) container.appendChild(childEl)
  }
  return container
}
