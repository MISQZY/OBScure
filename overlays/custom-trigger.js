// A Text node wired INTO a Background FX node captions paratrooper's
// nickname tag / airdrop's crate label with its content — mirrors
// findBackgroundFxLabel in SceneBuilderPage.tsx.
function backgroundFxLabel(node, edges, map, vars) {
  if (!node) return ''
  const textNode = incoming(node.id, edges, map).find((n) => n.type === 'text')
  return interpolate((textNode && textNode.data && textNode.data.text) || '', vars)
}

/**
 * `animate` distinguishes a silent content update (a scene save —
 * text/color/position/... should update live, but nothing should
 * replay) from an actual play (initial page load, or a
 * 'custom-overlay-trigger' broadcast from the Scene Builder's Test
 * button): only then do paratrooper/airdrop get an explicit trigger()
 * — see render(overlay, animate) below, and setRepeat/trigger on
 * paratrooper.js/airdrop.js for why a plain dataset.bg/visible write
 * alone isn't enough to safely replay a non-repeating effect.
 */
function applyBackgroundFx(node, animate, label) {
  const data = node?.data || {}
  const type = data.type || 'none'
  document.documentElement.style.setProperty('--bg-animation-color', data.color || '#18181b')
  document.documentElement.style.setProperty('--bg-animation-speed', String(data.speed || 1))
  paratrooperEffect.setSpeed(data.speed || 1)
  airdropEffect.setSpeed(data.speed || 1)
  paratrooperEffect.setRepeat(Boolean(data.repeat))
  airdropEffect.setRepeat(Boolean(data.repeat))
  paratrooperEffect.setNickname(label || '')
  airdropEffect.setLabel(label || '')
  bg.dataset.bg = type
  bg.classList.toggle('visible', type !== 'none')
  if (animate) {
    paratrooperEffect.trigger()
    airdropEffect.trigger()
  }
}

/**
 * Whether Scene is wired to a DataSource(alert) node — if so, the
 * scene is hidden until a matching alert fires (for real, or Test
 * simulating one), shows for durationMs, then hides again. Mirrors
 * sceneTrigger in SceneBuilderPage.tsx.
 */
function isEventTrigger(overlay) {
  const nodes = overlay?.nodes || []
  const edges = overlay?.edges || []
  const map = nodeMap(nodes)
  const scene = nodes.find((n) => n.type === 'scene')
  if (!scene) return { active: false, alertTypes: new Set(), durationMs: 6000 }
  const members = incoming(scene.id, edges, map)
  const alertTypes = new Set(
    members
      .filter((n) => n.type === 'event')
      .map((n) => n.data.alertType)
      .filter(Boolean)
  )
  if (alertTypes.size === 0) return { active: false, alertTypes, durationMs: 6000 }
  const timer = members.find((n) => n.type === 'timer')
  const durationMs = (timer && timer.data.delay) || 6000
  return { active: true, alertTypes, durationMs }
}

/**
 * Whether Scene is wired to an Audio Player node — a continuously
 * data-driven scene (see AudioPlayerNode's own doc comment in
 * components/nodes/index.tsx) instead of a one-shot alert: no
 * durationMs, shows for as long as the Now Playing feed says
 * isPlaying. Checked independently of isEventTrigger/processTrigger —
 * see render()'s own priority order among the three. Purely a
 * visibility switch — a Text/Image wired straight into Audio Player's
 * own Content socket gets live values with no Scene wiring at all (see
 * audioContentValues/hasAudioContentDeps), so this only matters if you
 * also want the whole scene to auto show/hide by playback state.
 */
function isAudioTrigger(overlay) {
  const nodes = overlay?.nodes || []
  const edges = overlay?.edges || []
  const map = nodeMap(nodes)
  const scene = nodes.find((n) => n.type === 'scene')
  if (!scene) return false
  return incoming(scene.id, edges, map).some((n) => n.type === 'audioPlayer')
}

/**
 * Whether Scene's process is armed — either by a DataSource(alert)
 * wired into its Start node (the process equivalent of isEventTrigger
 * above — `alertTypes`, matched against a real 'alert' broadcast in
 * handleAlert), or by an Audio Player wired into Start (`audioArmed`
 * — a DIFFERENT trigger condition: not a type match, just "the track
 * changed", checked in the 'now-playing' WS handler below). Either
 * one alone is enough to make `active` true — see render()'s own
 * `proc.active` branch, which needs to know the scene starts hidden
 * regardless of WHICH kind of trigger is armed.
 */
function processTrigger(overlay) {
  const nodes = overlay?.nodes || []
  const edges = overlay?.edges || []
  const map = nodeMap(nodes)
  const start = nodes.find((n) => n.type === 'start')
  if (!start) return { active: false, alertTypes: new Set(), audioArmed: false, rouletteArmed: false, randomArmed: false }
  const members = incoming(start.id, edges, map)
  const alertTypes = new Set(
    members
      .filter((n) => n.type === 'event')
      .map((n) => n.data.alertType)
      .filter(Boolean)
  )
  const audioArmed = members.some((n) => n.type === 'audioPlayer')
  // A round starting collecting (see the 'roulette-state' WS handler
  // below) arms this the same way a track change arms audioArmed —
  // "the round just started", not a type match.
  const rouletteArmed = members.some((n) => n.type === 'rouletteSource')
  // A roll committing (see the 'random-state' WS handler below) arms
  // this the same way — "a roll just started", not a type match.
  const randomArmed = members.some((n) => n.type === 'randomSource')
  return { active: alertTypes.size > 0 || audioArmed || rouletteArmed || randomArmed, alertTypes, audioArmed, rouletteArmed, randomArmed }
}

// Plays one Sound node's configured preset/custom file — mirrors the
// bundled-preset URL scheme AlertSoundPicker/alert.html's own
// soundUrlFor use (relative to this page, i.e. /overlays/sounds/<id>.wav).
// Shared by playSceneSound (Scene/Start's own Sound) and
// showProcessContent's per-Task sound (see TASK_SOCKETS' own doc
// comment in components/nodes/index.tsx).
function playSoundNode(soundNode) {
  const soundId = (soundNode && soundNode.data && soundNode.data.soundId) || 'none'
  if (soundId === 'none') return
  const customSoundName = soundNode.data.customSoundName
  if (soundId === 'custom' && !customSoundName) return
  const soundUrl = soundId === 'custom' ? `custom-sounds/${encodeURIComponent(customSoundName)}` : `sounds/${soundId}.wav`
  const audio = new Audio(soundUrl)
  audio.volume = soundNode.data.volume ?? 1
  audio.play().catch(() => {})
}

function playSceneSound(scene, edges, map) {
  playSoundNode(incoming(scene.id, edges, map).find((n) => n.type === 'sound'))
}
