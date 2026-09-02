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
function buildText(node, mods, animate, vars, registry, crossAxis, contentValues, replaceText) {
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
  // or (typically) not at all.
  const text = replaceText != null ? replaceText : interpolate(d.text ?? '', contentValues ? { ...vars, ...contentValues } : vars)
  applyAutoScrollContent(el, mods, () => {
    const span = document.createElement('span')
    span.textContent = text
    return span
  }, node.id)
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
    const contentValues = audioValues || randomValues ? { ...audioValues, ...randomValues } : null
    const replaceText = rouletteEntrantsTextValue(node.id, edges, map)
    return buildText(node, mods, animate, vars, registry, crossAxis, contentValues, replaceText)
  }
  if (node.type === 'image') return buildImage(node, mods, animate, vars, registry, hasAudioCover(node.id, edges, map))
  if (node.type === 'video') return buildVideo(node, mods, animate, registry)
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
    container.style.padding = `${d.paddingY ?? 12}px ${d.paddingX ?? 16}px`
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
