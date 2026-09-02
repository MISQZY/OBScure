// 'roulette-state' only broadcasts on an actual STATE change (a new
// entrant, a phase change, ...), not once a second — so {timeLeft}
// (and the wheel widget's own countdown badge) would otherwise only
// update whenever someone happens to join, not tick down live. This
// runs a self-clearing 1s poll for exactly as long as a round is
// 'collecting', silently refreshing anything roulette-dependent (see
// hasRouletteContentDeps) each tick — same shape as
// RouletteToolPage.tsx's own setInterval while phase === 'collecting'.
let rouletteCountdownIntervalId = null

function ensureRouletteCountdownTicking() {
  if (latestRouletteState.phase === 'collecting') {
    if (rouletteCountdownIntervalId != null) return
    rouletteCountdownIntervalId = setInterval(() => {
      if (latestRouletteState.phase !== 'collecting') {
        clearInterval(rouletteCountdownIntervalId)
        rouletteCountdownIntervalId = null
        return
      }
      if (hasRouletteContentDeps(latestOverlay)) render(latestOverlay, false)
    }, 1000)
  } else if (rouletteCountdownIntervalId != null) {
    clearInterval(rouletteCountdownIntervalId)
    rouletteCountdownIntervalId = null
  }
}

/**
 * Walks from the Scene node: whatever's wired into it (directly, or
 * nested inside a Box) is what's rendered — mirrors ScenePreview in
 * SceneBuilderPage.tsx. A scene saved before Scene existed has no such
 * node; for those, fall back to the old flat scan (first Box, every
 * Image, every Text, ignoring connections) so it keeps rendering as it
 * always did. Only called for a NON-event-triggered overlay — see
 * render()/isEventTrigger below for the always-visible vs
 * hidden-until-triggered split.
 *
 * `animate` controls whether this pass is allowed to play anything:
 * entrance Animation modifiers, and a fresh paratrooper/airdrop drop
 * (see applyBackgroundFx/applyAnimation). True for the initial page
 * load and for a 'custom-overlay-trigger' broadcast (the Scene
 * Builder's Test button); false for an ordinary 'custom-overlay-config'
 * broadcast (a Save) — content still updates live, nothing replays.
 * See OverlayServer.setCustomOverlays vs .testCustomOverlay for the
 * two broadcast paths.
 */
function renderStatic(overlay, animate) {
  sceneEl.style.display = 'flex'
  missingEl.style.display = 'none'
  sceneEl.innerHTML = ''

  const nodes = overlay.nodes || []
  const edges = overlay.edges || []
  const map = nodeMap(nodes)
  const scene = nodes.find((n) => n.type === 'scene')

  if (!scene) {
    const box = nodes.find((n) => n.type === 'box')
    const images = nodes.filter((n) => n.type === 'image')
    const texts = nodes.filter((n) => n.type === 'text')
    const bgFxNode = nodes.find((n) => n.type === 'backgroundAnimation')
    applyBackgroundFx(bgFxNode, animate, backgroundFxLabel(bgFxNode, edges, map))

    const container = document.createElement('div')
    container.className = 'box'
    if (box) {
      const d = box.data || {}
      container.style.background = d.background || '#18181b'
      container.style.padding = `${d.paddingY ?? 12}px ${d.paddingX ?? 16}px`
      container.style.borderRadius = `${d.borderRadius ?? 10}px`
      if (d.borderEnabled) container.style.border = `${d.borderWidth ?? 2}px solid ${d.borderColor || '#ffffff'}`
    }
    for (const n of images) container.appendChild(buildImage(n, [], animate, null))
    for (const n of texts) container.appendChild(buildText(n, [], animate, undefined, undefined, 'horizontal'))
    sceneEl.appendChild(container)
    return
  }

  const members = incoming(scene.id, edges, map)
  const bgFxNode = members.find((n) => n.type === 'backgroundAnimation')
  applyBackgroundFx(bgFxNode, animate, backgroundFxLabel(bgFxNode, edges, map))
  sceneEl.style.flexDirection = orderingFlexDirection(members)
  sceneEl.style.gap = `${orderingGap(members)}px`
  const renderable = members.filter(
    (n) => n.type === 'box' || n.type === 'group' || n.type === 'text' || n.type === 'image' || n.type === 'video' || n.type === 'randomPick' || n.type === 'rouletteWidget' || n.type === 'randomWidget'
  )
  const crossAxis = crossAxisFor(members)

  for (const n of renderable) {
    const el = n.type === 'box' || n.type === 'group' ? buildBox(n, edges, map, animate) : buildContent(n, edges, map, animate, undefined, undefined, 0, crossAxis)
    if (el) sceneEl.appendChild(el)
  }
}

/**
 * Shows an event-triggered scene for one event: fills placeholders
 * from `vars` (the real alert payload, or Test/handlePlay's sample
 * data), plays entrance Animation/Background FX/Sound, then auto-hides
 * after `durationMs` — mirrors alert.html's showAlert()/hide(), and
 * handlePlay's local simulation in SceneBuilderPage.tsx.
 */
function showTriggeredContent(overlay, vars, durationMs) {
  clearTimeout(hideTimer)
  sceneEl.style.display = 'flex'
  missingEl.style.display = 'none'
  sceneEl.innerHTML = ''

  const nodes = overlay.nodes || []
  const edges = overlay.edges || []
  const map = nodeMap(nodes)
  const scene = nodes.find((n) => n.type === 'scene')
  if (!scene) return

  const members = incoming(scene.id, edges, map)
  const bgFxNode = members.find((n) => n.type === 'backgroundAnimation')
  applyBackgroundFx(bgFxNode, true, backgroundFxLabel(bgFxNode, edges, map, vars))
  sceneEl.style.flexDirection = orderingFlexDirection(members)
  sceneEl.style.gap = `${orderingGap(members)}px`
  const renderable = members.filter(
    (n) => n.type === 'box' || n.type === 'group' || n.type === 'text' || n.type === 'image' || n.type === 'video' || n.type === 'randomPick' || n.type === 'rouletteWidget' || n.type === 'randomWidget'
  )
  const crossAxis = crossAxisFor(members)
  for (const n of renderable) {
    const el = n.type === 'box' || n.type === 'group' ? buildBox(n, edges, map, true, vars) : buildContent(n, edges, map, true, vars, undefined, 0, crossAxis)
    if (el) sceneEl.appendChild(el)
  }
  playSceneSound(scene, edges, map)

  hideTimer = setTimeout(hideTriggeredContent, durationMs)
}

/**
 * The Process-driven equivalent of showTriggeredContent, used whenever
 * Scene has a Start node reachable via sequence-flow edges (see
 * buildProcessSchedule above) — builds every Text/Image/Box wired into
 * Scene up front, exactly like renderStatic does (so Box-nesting/
 * layout stays intact regardless of which pieces a Task targets), then
 * one setTimeout per distinct Task moment re-applies computeTaskState
 * to the component(s) it affects. A component with no Task targeting
 * it at all isn't touched here — it renders normally, unaffected by
 * the process, same as any other content in a plain scene.
 */
function showProcessContent(overlay, vars, schedule, totalMs) {
  clearTimeout(hideTimer)
  processTimers.forEach(clearTimeout)
  processTimers = []
  sceneEl.style.display = 'flex'
  missingEl.style.display = 'none'
  sceneEl.innerHTML = ''

  const nodes = overlay.nodes || []
  const edges = overlay.edges || []
  const map = nodeMap(nodes)
  const scene = nodes.find((n) => n.type === 'scene')
  const start = nodes.find((n) => n.type === 'start')

  // Background FX/Sound are wired into Start for a process-driven
  // scene (the trigger point), the same way Event is — not Scene.
  if (start) {
    const bgFxNode = incoming(start.id, edges, map).find((n) => n.type === 'backgroundAnimation')
    applyBackgroundFx(bgFxNode, true, backgroundFxLabel(bgFxNode, edges, map, vars))
    playSceneSound(start, edges, map)
  }

  const members = scene ? incoming(scene.id, edges, map) : []
  sceneEl.style.flexDirection = orderingFlexDirection(members)
  sceneEl.style.gap = `${orderingGap(members)}px`
  const renderable = members.filter(
    (n) => n.type === 'box' || n.type === 'group' || n.type === 'text' || n.type === 'image' || n.type === 'video' || n.type === 'randomPick' || n.type === 'rouletteWidget' || n.type === 'randomWidget'
  )
  const crossAxis = crossAxisFor(members)
  const registry = {}
  // animate=true: a component with no Task ever targeting it should
  // still play its own Animation modifier once on the process's
  // initial build — "unaffected by the process, same as any other
  // content in a plain scene" (see this function's own doc comment),
  // and a plain scene DOES animate on load (renderStatic(overlay,
  // true)). Redundant-but-harmless for a Task-targeted component:
  // applyAt(0) below re-applies its real t=0 state immediately after,
  // in the same tick, before anything paints.
  for (const n of renderable) {
    const el = n.type === 'box' || n.type === 'group' ? buildBox(n, edges, map, true, vars, registry) : buildContent(n, edges, map, true, vars, registry, 0, crossAxis)
    if (el) sceneEl.appendChild(el)
  }

  const targetIds = [...new Set(schedule.map((s) => s.targetId))]
  // Every Task's own Sound (see TASK_SOCKETS' own doc comment in
  // components/nodes/index.tsx), grouped by the same atMs its Task
  // fires at — played once per moment alongside applyAt below, not
  // treated as target style (computeTaskState never looks at it).
  const soundsByAtMs = {}
  for (const s of schedule) {
    const soundMod = s.mods.find((m) => m.type === 'sound')
    if (!soundMod) continue
    if (!soundsByAtMs[s.atMs]) soundsByAtMs[s.atMs] = []
    soundsByAtMs[s.atMs].push(soundMod)
  }
  const playSoundsAt = (atMs) => (soundsByAtMs[atMs] || []).forEach(playSoundNode)
  const applyAt = (atMs) => {
    for (const id of targetIds) {
      const el = registry[id]
      if (el) {
        const baseMods = incoming(id, edges, map)
        applyTaskStateToEl(el, computeTaskState(schedule, id, atMs), baseMods)
      }
    }
  }
  applyAt(0)
  playSoundsAt(0)
  const atMsValues = [...new Set(schedule.map((s) => s.atMs).filter((t) => t > 0))].sort((a, b) => a - b)
  for (const atMs of atMsValues) {
    processTimers.push(
      setTimeout(() => {
        applyAt(atMs)
        playSoundsAt(atMs)
      }, atMs)
    )
  }

  // See processExitBufferMs's own doc comment: without the buffer,
  // whichever Task(s) fire at exactly totalMs (the schedule's last
  // moment) get torn down before their animation plays a single
  // frame.
  hideTimer = setTimeout(() => {
    applyBackgroundFx(undefined, false, '')
    sceneEl.style.display = 'none'
    sceneEl.innerHTML = ''
    hideTimer = null
    processNextAlert()
  }, totalMs + processExitBufferMs(schedule, totalMs))
}

// Reverses each animated element's entrance: adding .hiding is enough,
// animations.css picks it up (the same [data-animation="X"] rule set
// used for the entrance, just the .hiding variant) at the SAME
// duration the entrance used (--anim-duration) — one Animation node
// governs both directions, there's no separate exit-only field.
// Elements with no Animation modifier never got data-animation set at
// all (see applyAnimation), so they're skipped — no animation to
// reverse. Returns how long (ms) to wait before it's safe to actually
// clear the DOM, 0 if nothing needs to play out.
function playExitAnimations(container) {
  const animated = container.querySelectorAll('[data-animation]')
  let maxMs = 0
  animated.forEach((el) => {
    el.classList.add('hiding')
    // Read --anim-duration directly from the element's inline style
    // (set by applyAnimation) instead of getComputedStyle(), which
    // would force a layout recalc on every iteration (layout thrashing).
    const raw = el.style.getPropertyValue('--anim-duration')
    const ms = raw ? parseFloat(raw) : 300 // default animation duration fallback
    if (Number.isFinite(ms) && ms > maxMs) maxMs = ms
  })
  return maxMs
}

/** Reverses showTriggeredContent — back to hidden-and-waiting for the next event. */
function hideTriggeredContent() {
  clearTimeout(hideTimer)
  hideTimer = null
  applyBackgroundFx(undefined, false, '')
  const exitMs = playExitAnimations(sceneEl)
  if (exitMs <= 0) {
    sceneEl.style.display = 'none'
    sceneEl.innerHTML = ''
    processNextAlert()
    return
  }
  setTimeout(() => {
    sceneEl.style.display = 'none'
    sceneEl.innerHTML = ''
    processNextAlert()
  }, exitMs)
}

/**
 * Shows/updates a continuously data-driven scene (an Audio Player node
 * wired into Scene — see isAudioTrigger) with the latest Now Playing
 * vars. Unlike showTriggeredContent/showProcessContent there's no
 * durationMs/hideTimer here — hideAudioContent (below) is the only
 * thing that tears it down, driven by the feed's own isPlaying flag
 * rather than a fixed timer. `animate` is false for a same-track
 * refresh (see the 'now-playing' branch below) so a routine poll tick
 * doesn't replay the entrance every few seconds.
 */
function showAudioContent(overlay, vars, animate) {
  audioVisible = true
  sceneEl.style.display = 'flex'
  missingEl.style.display = 'none'
  sceneEl.innerHTML = ''

  const nodes = overlay.nodes || []
  const edges = overlay.edges || []
  const map = nodeMap(nodes)
  const scene = nodes.find((n) => n.type === 'scene')
  if (!scene) return

  const members = incoming(scene.id, edges, map)
  const bgFxNode = members.find((n) => n.type === 'backgroundAnimation')
  applyBackgroundFx(bgFxNode, animate, backgroundFxLabel(bgFxNode, edges, map, vars))
  sceneEl.style.flexDirection = orderingFlexDirection(members)
  sceneEl.style.gap = `${orderingGap(members)}px`
  const renderable = members.filter(
    (n) => n.type === 'box' || n.type === 'group' || n.type === 'text' || n.type === 'image' || n.type === 'video' || n.type === 'randomPick' || n.type === 'rouletteWidget' || n.type === 'randomWidget'
  )
  const crossAxis = crossAxisFor(members)
  for (const n of renderable) {
    const el = n.type === 'box' || n.type === 'group' ? buildBox(n, edges, map, animate, vars) : buildContent(n, edges, map, animate, vars, undefined, 0, crossAxis)
    if (el) sceneEl.appendChild(el)
  }
}

/** Reverses showAudioContent when the feed reports isPlaying: false — mirrors hideTriggeredContent, just with no hideTimer/queue involved. */
function hideAudioContent() {
  audioVisible = false
  applyBackgroundFx(undefined, false, '')
  const exitMs = playExitAnimations(sceneEl)
  if (exitMs <= 0) {
    sceneEl.style.display = 'none'
    sceneEl.innerHTML = ''
    return
  }
  setTimeout(() => {
    sceneEl.style.display = 'none'
    sceneEl.innerHTML = ''
  }, exitMs)
}

/**
 * Entry point for every REAL 'alert' broadcast (not Test/Play, which
 * call showProcessContent/showTriggeredContent directly with sample
 * data — see render()'s simulateTest branch). A second alert arriving
 * while one is still on screen used to clobber it mid-animation
 * (showProcessContent/showTriggeredContent both rebuild from scratch);
 * now it queues (FIFO, capped at MAX_QUEUED_ALERTS) and plays once the
 * current one tears itself down — see processNextAlert, called from
 * both hideTriggeredContent and showProcessContent's own hideTimer.
 */
function handleAlert(payload) {
  const proc = processTrigger(latestOverlay)
  const matchesProcess = proc.active && proc.alertTypes.has(payload.type)
  const trigger = isEventTrigger(latestOverlay)
  const matchesTrigger = !matchesProcess && trigger.active && trigger.alertTypes.has(payload.type)
  if (!matchesProcess && !matchesTrigger) return

  if (alertActive) {
    if (alertQueue.length < MAX_QUEUED_ALERTS) alertQueue.push(payload)
    return
  }

  alertActive = true
  const vars = normalizeAlertVars(payload)
  if (matchesProcess) {
    const built = buildProcessSchedule(latestOverlay.nodes || [], latestOverlay.edges || [], vars)
    if (built) {
      showProcessContent(latestOverlay, vars, built.schedule, built.totalMs)
      return
    }
  } else {
    showTriggeredContent(latestOverlay, vars, trigger.durationMs)
    return
  }
  alertActive = false
}

/** Called once the currently-showing alert has fully torn itself down — plays the next queued one, if any (re-validated against the current graph via handleAlert, in case a Save changed what matches while it was waiting). */
function processNextAlert() {
  alertActive = false
  if (alertQueue.length === 0) return
  handleAlert(alertQueue.shift())
}

/**
 * Entry point for every config/trigger/initial-load path.
 * `animate` — see renderStatic's own doc comment; only meaningful for
 * a non-event-triggered (static) scene.
 * `simulateTest` — true only for a 'custom-overlay-trigger' broadcast
 * (Test button): for an event-triggered/process scene, simulates one
 * event with sample data instead of waiting for a real one. A static
 * scene ignores this and just replays via renderStatic(overlay, true),
 * same as before.
 *
 * A Start node (processTrigger) takes priority over the plain
 * DataSource(alert)+Timer->Scene model (isEventTrigger) — see the doc
 * comment above buildProcessSchedule.
 */
function render(overlay, animate = true, simulateTest = false) {
  latestOverlay = overlay
  if (!overlay) {
    clearTimeout(hideTimer)
    hideTimer = null
    sceneEl.style.display = 'none'
    missingEl.style.display = 'block'
    bg.classList.remove('visible')
    return
  }

  const proc = processTrigger(overlay)
  if (proc.active) {
    missingEl.style.display = 'none'
    if (simulateTest) {
      // Sample data shaped to whichever trigger is actually armed —
      // an alert-shaped vars object would leave a Task's own
      // {title}/{artist}/{entrants}/{winner} placeholders literal
      // (nothing wrong with that, just not a useful Test preview) on a
      // process armed purely by Audio Player/Roulette (see
      // processTrigger's audioArmed/rouletteArmed), so those get
      // Now-Playing/round-shaped sample vars instead, mirroring the
      // non-process isAudioTrigger simulateTest branch above (Roulette
      // has no scene-wide equivalent of its own — only this
      // process-armed case). alertTypes wins over audio, which wins
      // over roulette, when more than one is wired to the same Start.
      // Computed BEFORE buildProcessSchedule (not just showProcessContent)
      // since a Condition node needs these SAME vars to pick Then/Else —
      // only the alert-shaped case actually carries {user}/{amount}/
      // {message}/{source}, so a Condition falls to Else for the other two.
      const vars =
        proc.alertTypes.size > 0
          ? { type: [...proc.alertTypes][0], user: 'Viewer', amount: 25, message: 'Sample message', source: 'twitch' }
          : proc.audioArmed
            ? { source: 'spotify', title: 'Sample Track', artist: 'Sample Artist', albumArt: '', isPlaying: true }
            : { entrants: 'Alice, Bob, Carla', winner: 'Alice' }
      const built = buildProcessSchedule(overlay.nodes || [], overlay.edges || [], proc.alertTypes.size > 0 ? vars : null)
      if (built) showProcessContent(overlay, vars, built.schedule, built.totalMs)
      return
    }
    // A process armed PURELY by Roulette or Random (no real alert
    // type, no Audio Player) does NOT hide the rest of the scene
    // between individual roulette-state/random-state ticks — see
    // ROULETTE_OUTPUTS'/RANDOM_OUTPUTS' own doc comments in
    // components/nodes/constants.ts: the Widget/secondary node show
    // unconditionally regardless of this wiring; only the Task-driven
    // one-shot cue itself (fired directly via showProcessContent, from
    // the 'roulette-state'/'random-state' WS handler's own
    // justStartedCollecting/justCommitted branch) is actually gated by
    // "did a round just start"/"did a roll just commit". Falling
    // through to the plain static render here is what keeps the
    // widget visible — and, for Roulette, its own spin animation
    // actually playing — on every LATER tick, instead of it vanishing
    // the instant render() is next called for any other reason (this
    // was the "spin animation disappeared" bug: every roulette-state
    // tick after the first ended up here and wiped sceneEl since
    // `hideTimer` is never set by the process path).
    if ((proc.rouletteArmed || proc.randomArmed) && !proc.audioArmed && proc.alertTypes.size === 0) {
      renderStatic(overlay, animate)
      return
    }
    if (!hideTimer) {
      sceneEl.style.display = 'none'
      sceneEl.innerHTML = ''
    }
    return
  }

  const trigger = isEventTrigger(overlay)
  if (!trigger.active) {
    missingEl.style.display = 'none'
    if (isAudioTrigger(overlay)) {
      if (simulateTest) {
        showAudioContent(overlay, { source: 'spotify', title: 'Sample Track', artist: 'Sample Artist', albumArt: '', isPlaying: true }, true)
        return
      }
      if (latestNowPlaying.isPlaying) {
        showAudioContent(overlay, latestNowPlaying, animate)
      } else if (audioVisible) {
        hideAudioContent()
      } else {
        sceneEl.style.display = 'none'
        sceneEl.innerHTML = ''
      }
      return
    }
    renderStatic(overlay, animate)
    return
  }

  missingEl.style.display = 'none'
  if (simulateTest) {
    const sampleType = [...trigger.alertTypes][0] || 'subscription'
    showTriggeredContent(
      overlay,
      { type: sampleType, user: 'Viewer', amount: 25, message: 'Sample message', source: 'twitch' },
      trigger.durationMs
    )
    return
  }
  // Idle: sit hidden and wait for a real alert (see the 'alert' branch
  // below). Don't interrupt one that's already showing (hideTimer set).
  if (!hideTimer) {
    sceneEl.style.display = 'none'
    sceneEl.innerHTML = ''
  }
}

if (!key) {
  render(null)
} else {
  // Fetched alongside the overlay's own config so the FIRST render
  // already reflects whatever's currently playing (if anything),
  // instead of the `{ isPlaying: false }` default latestNowPlaying
  // starts as — pollers only broadcast 'now-playing' on an actual
  // change (see NowPlayingCache's own doc comment), so a page
  // opened/reloaded mid-track would otherwise show nothing (or a
  // Content-wired Text/Image would show blank) until the NEXT track.
  // A failed fetch here just keeps that default rather than failing
  // the whole page load — see the now-playing.json .catch below. Same
  // reasoning for roulette-state.json: a page opened/reloaded mid-round
  // would otherwise show nothing (or a Content-wired Text/wheel widget
  // would show empty) until the round's NEXT state change.
  Promise.all([
    fetch(`/overlays/config/custom.json?key=${encodeURIComponent(key)}`).then((res) => res.json()),
    fetch('/overlays/config/now-playing.json')
      .then((res) => res.json())
      .catch(() => null),
    fetch('/overlays/config/roulette-state.json')
      .then((res) => res.json())
      .catch(() => null),
    fetch('/overlays/config/random-state.json')
      .then((res) => res.json())
      .catch(() => null)
  ])
    .then(([overlay, nowPlaying, rouletteState, randomState]) => {
      if (nowPlaying) latestNowPlaying = nowPlaying
      if (randomState) latestRandomState = randomState
      if (rouletteState) {
        latestRouletteState = rouletteState
        // A page opened/reloaded mid-round (or after one already
        // finished) starts rouletteWheelRotationDeg at its plain 0
        // default — only the 'roulette-state' WS handler's own
        // collecting->spinning transition (below) ever moves it.
        // Without this, the wheel would render un-rotated while the
        // badge/dimming still show the real winner, i.e. the pointer
        // wouldn't line up with the highlighted sector. Mirrors
        // RouletteToolPage.tsx's own winner-positioning effect, which
        // re-derives the target rotation on MOUNT for any
        // spinning/result state, not just a live transition. No
        // rouletteSpinFromDeg set here — this is a first paint, so it
        // should snap straight to the target with no spin-up
        // animation, same as that effect's animateWheel=false path.
        if ((rouletteState.phase === 'spinning' || rouletteState.phase === 'result') && rouletteState.winner) {
          rouletteWheelRotationDeg = computeRouletteWinnerRotation(
            rouletteState.entrants || [],
            rouletteState.winner.id,
            rouletteWheelRotationDeg
          )
        }
      }
      ensureRouletteCountdownTicking()
      render(overlay, true)
    })
    .catch(() => render(null))

  function connect() {
    const ws = new WebSocket(`ws://${location.host}/ws`)
    ws.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data)
      if (type === 'custom-overlay-config') {
        render(payload.find((o) => o.urlKey === key) ?? null, false)
      } else if (type === 'custom-overlay-trigger' && payload?.urlKey === key) {
        render(latestOverlay, true, true)
      } else if (type === 'alert') {
        handleAlert(payload)
      } else if (type === 'now-playing') {
        const audioTriggered = isAudioTrigger(latestOverlay)
        // Computed BEFORE latestNowPlaying is overwritten below —
        // reused both for showAudioContent's own animate arg (same
        // track re-polled vs. a real new one) and to fire a
        // Start-wired Audio Player's own Process trigger (see
        // processTrigger's audioArmed, just below) only on an ACTUAL
        // track change, not every poll tick.
        const trackChanged = payload.isPlaying && (payload.title !== latestNowPlaying.title || payload.artist !== latestNowPlaying.artist)
        if (audioTriggered) {
          if (payload.isPlaying) {
            showAudioContent(latestOverlay, payload, !audioVisible || trackChanged)
          } else if (audioVisible) {
            hideAudioContent()
          }
        }
        latestNowPlaying = payload
        // Fires the SAME Start->Task->...->End sequence a real alert
        // would (see handleAlert's own matchesProcess branch) whenever
        // Start is wired to Audio Player (processTrigger's audioArmed)
        // — an alternative arming condition to Event's alertType
        // matching, for a process that should play some
        // animation/sound/update each time a new track starts. NOT
        // queued behind alertActive like a real alert (see
        // MAX_QUEUED_ALERTS/alertQueue) — missing one track change
        // while something else is already showing isn't worth queuing
        // up behind it.
        if (trackChanged && !alertActive) {
          const proc = processTrigger(latestOverlay)
          if (proc.audioArmed) {
            // null vars: a track-change has no {user}/{amount}/{message}/
            // {source}-shaped alert to check — any Condition in this
            // process falls to Else, same as evaluateCondition's own
            // "field absent" case.
            const built = buildProcessSchedule(latestOverlay.nodes || [], latestOverlay.edges || [], null)
            if (built) {
              alertActive = true
              showProcessContent(latestOverlay, payload, built.schedule, built.totalMs)
            }
          }
        }
        // A plain scene (no Audio-Player→Scene wiring, so untouched by
        // showAudioContent/hideAudioContent above) may still have a
        // Text/Image wired straight into Audio Player's Content socket
        // (see hasAudioContentDeps) — silently refresh it so those
        // values keep tracking the live track too. animate=false: this
        // fires on every poll tick, not just a real track change,
        // replaying entrance animations here would be constant and
        // wrong (same reasoning as showAudioContent's own animate arg).
        if (!audioTriggered && hasAudioContentDeps(latestOverlay)) render(latestOverlay, false)
      } else if (type === 'roulette-state') {
        // Reused both to decide whether to fire a Start-wired
        // Roulette's own Process trigger (see processTrigger's
        // rouletteArmed, just below) and to gate the silent refresh
        // further down — only the moment a round actually starts
        // collecting, not on every entrant.
        const justStartedCollecting = payload.phase === 'collecting' && latestRouletteState.phase !== 'collecting'
        // The winner-rotation target, computed the moment a round
        // transitions into 'spinning' — see rouletteSpinFromDeg/
        // computeRouletteWinnerRotation's own doc comments.
        // rouletteWheelRotationDeg is updated to the NEW target here
        // (before latestRouletteState is overwritten below) so
        // whichever render below actually runs picks it up uniformly
        // through buildRouletteWheel.
        if (payload.phase === 'spinning' && latestRouletteState.phase !== 'spinning' && payload.winner) {
          rouletteSpinFromDeg = rouletteWheelRotationDeg
          rouletteWheelRotationDeg = computeRouletteWinnerRotation(payload.entrants || [], payload.winner.id, rouletteWheelRotationDeg)
        }
        latestRouletteState = payload
        const vars = rouletteStateVars(payload)

        // Fires the SAME Start->Task->...->End sequence a real alert
        // would (see handleAlert's own matchesProcess branch) whenever
        // Start is wired to Roulette (processTrigger's rouletteArmed)
        // — an alternative arming condition, for a process that should
        // play some animation/sound/update the moment a round starts
        // collecting (NOT the wheel widget itself, which shows on its
        // own regardless — see ROULETTE_OUTPUTS' own doc comment in
        // components/nodes/constants.ts). NOT queued behind
        // alertActive, same reasoning as the 'now-playing' branch's
        // own trackChanged handling above.
        let processArmedThisTick = false
        if (justStartedCollecting && !alertActive) {
          const proc = processTrigger(latestOverlay)
          if (proc.rouletteArmed) {
            // null vars: `vars` here is rouletteStateVars' own
            // {entrants}/{entrantsList}/{winner}/{timeLeft} shape, not
            // an alert's {user}/{amount}/{message}/{source} — a
            // Condition has nothing of that shape to check, so it
            // falls to Else, same as evaluateCondition's "field
            // absent" case.
            const built = buildProcessSchedule(latestOverlay.nodes || [], latestOverlay.edges || [], null)
            if (built) {
              alertActive = true
              processArmedThisTick = true
              showProcessContent(latestOverlay, vars, built.schedule, built.totalMs)
            }
          }
        }
        // A Text wired straight into Roulette's own Content socket,
        // or a Widget wired straight into Scene/a Box, needs a live
        // refresh on every tick to keep tracking the round — see
        // hasRouletteContentDeps. Skipped when THIS SAME tick already
        // fired the process above: showProcessContent just rendered
        // the whole scene fresh, so rendering it again right after
        // would tear the wheel widget down and rebuild it a SECOND
        // time in the same instant — it'd visibly flash/restart, as
        // if another wheel had launched. `animate` is true only when a
        // spin just armed (rouletteSpinFromDeg != null) so the widget
        // still picks up its spin-up transition; otherwise false, same
        // reasoning as showAudioContent's own animate arg.
        if (!processArmedThisTick && hasRouletteContentDeps(latestOverlay)) render(latestOverlay, rouletteSpinFromDeg != null)
        ensureRouletteCountdownTicking()
      } else if (type === 'random-state') {
        // Reused both to decide whether to fire a Start-wired
        // Random's own Process trigger (see processTrigger's
        // randomArmed, just below) and to gate the silent refresh
        // further down — only the moment a roll actually commits (a
        // hash published), not on reveal.
        const justCommitted = payload.phase === 'committed' && latestRandomState.phase !== 'committed'
        // Armed for exactly one render pass (see randomRevealArmed's
        // own doc comment) the instant a roll transitions into
        // 'revealed', so buildRandomWidget actually plays the roll-in
        // instead of snapping straight to the final numbers.
        if (payload.phase === 'revealed' && latestRandomState.phase !== 'revealed') {
          randomRevealArmed = true
        }
        latestRandomState = payload

        // Fires the SAME Start->Task->...->End sequence a real alert
        // would, whenever Start is wired to Random (processTrigger's
        // randomArmed) — an alternative arming condition, for a
        // process that should play some animation/sound/update the
        // moment a roll commits (NOT the widget itself, which shows
        // on its own regardless — see RANDOM_OUTPUTS' own doc comment
        // in components/nodes/constants.ts). No scene-level vars of
        // its own (unlike Roulette's {entrants}/{winner}/{timeLeft} —
        // see rouletteStateVars above): the number/hash/seed only ever
        // reach a Text via Random's own Content wire straight into
        // that Text's Content socket (see randomContentValues), not
        // scene-wide placeholders.
        // NOT queued behind alertActive, same reasoning as the
        // 'roulette-state' branch's own justStartedCollecting handling.
        let processArmedThisTick = false
        if (justCommitted && !alertActive) {
          const proc = processTrigger(latestOverlay)
          if (proc.randomArmed) {
            // null vars: no alert-shaped {user}/{amount}/{message}/
            // {source} here either — any Condition falls to Else.
            const built = buildProcessSchedule(latestOverlay.nodes || [], latestOverlay.edges || [], null)
            if (built) {
              alertActive = true
              processArmedThisTick = true
              showProcessContent(latestOverlay, {}, built.schedule, built.totalMs)
            }
          }
        }
        // A Text wired straight into Random's own Content output, or
        // a Widget wired straight into Scene/a Box, needs a live
        // refresh on every phase change to keep tracking the roll —
        // see hasRandomContentDeps. Skipped when THIS SAME tick
        // already fired the process above, same reasoning as the
        // 'roulette-state' branch's own processArmedThisTick handling.
        // `animate` is true only right after a reveal (randomRevealArmed)
        // so the widget picks up its roll-in transition; otherwise
        // false, same reasoning as showAudioContent's own animate arg.
        if (!processArmedThisTick && hasRandomContentDeps(latestOverlay)) render(latestOverlay, randomRevealArmed)
      }
    }
    ws.onclose = () => setTimeout(connect, 1000)
  }
  connect()
}
