// { artist, title } sourced straight from `latestNowPlaying` (the
// always-current global, NOT this render's own `vars` — see its own
// doc comment) when Audio Player's Content output (see TEXT_SOCKETS/
// AUDIO_PLAYER_OUTPUTS in components/nodes/index.tsx) feeds this
// Text's own Content socket, or null when it isn't wired in — in
// which case buildText's {title}/{artist} placeholders resolve from
// `vars` alone, unchanged. Both fields always come together — Content
// is one bundled wire, not separate Author/Title ones. Reading the
// global rather than `vars` is what lets this work with NO Scene
// wiring at all (see hasAudioContentDeps below) — `vars` only ever
// carries title/artist when the SCENE itself is Audio-Player-driven
// (showAudioContent), which this deliberately doesn't require.
function audioContentValues(nodeId, edges, map) {
  const hasAudioContent = edges.some((e) => e.target === nodeId && e.targetHandle === 'content' && map[e.source] && map[e.source].type === 'audioPlayer')
  if (!hasAudioContent) return null
  return { artist: latestNowPlaying.artist || '', title: latestNowPlaying.title || '' }
}

// Whether this Image's `imageContent` socket is wired to Audio
// Player's Content output — forces the live album art unconditionally
// (from the same always-current `latestNowPlaying` global
// audioContentValues reads above), taking priority over a set
// URL/uploaded image the same way leaving the URL empty already does
// on its own (see buildImage).
function hasAudioCover(nodeId, edges, map) {
  return edges.some((e) => e.target === nodeId && e.targetHandle === 'imageContent' && map[e.source] && map[e.source].type === 'audioPlayer')
}

// Whether ANY node in the graph has a Content-socket wire to Audio
// Player (see audioContentValues/hasAudioCover above) — doesn't
// bother checking reachability from Scene, since a wire on a node
// that isn't actually rendered is harmless to (uselessly) refresh
// for. Used only to decide whether a plain, non-Audio-Player-
// triggered scene needs a silent re-render on every 'now-playing'
// tick to keep those live values current — see the WebSocket
// handler's own 'now-playing' branch below.
function hasAudioContentDeps(overlay) {
  const edges = overlay?.edges || []
  const nodes = overlay?.nodes || []
  const map = nodeMap(nodes)
  return edges.some((e) => (e.targetHandle === 'content' || e.targetHandle === 'imageContent') && map[e.source] && map[e.source].type === 'audioPlayer')
}

// Mirrors RouletteToolPage.tsx's own formatCountdown exactly — days
// only shown once genuinely relevant, minutes:seconds otherwise.
function formatRouletteCountdown(totalSeconds) {
  const total = Math.max(0, Math.trunc(totalSeconds))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n) => String(n).padStart(2, '0')
  if (days > 0) return `${days}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${minutes}:${pad(seconds)}`
}

// { entrants, entrantsList, winner, timeLeft } sourced straight from
// `latestRouletteState` (the always-current global, NOT this render's
// own `vars`) when a Roulette node's Content output feeds this Text's
// own Content socket, or null when it isn't wired in — mirrors
// audioContentValues above (own doc comment there covers the shared
// reasoning). `entrants` is comma-joined (an inline sentence like
// "Playing: {entrants}"); `entrantsList` is newline-joined instead,
// for a Text node whose ENTIRE content is just "{entrantsList}" — the
// `.text-node` CSS class already preserves literal line breaks (see
// buildText's own doc comment), so that alone renders one entrant per
// line with no extra template work. `winner` only resolves once
// `phase === 'result'` — RouletteEngine already knows the winner the
// INSTANT a round starts spinning, well before the wheel visually
// stops, so revealing it any earlier here would spoil the wheel
// widget's own suspense (see buildRouletteWheel's own doc comment for
// the matching fix on the wheel/sector-dimming side). `timeLeft` is
// the formatted countdown while 'collecting', blank otherwise — kept
// ticking every second by ensureRouletteCountdownTicking below.
function rouletteStateVars(state) {
  return {
    entrants: (state.entrants || []).map((entrant) => entrant.name).join(', '),
    entrantsList: (state.entrants || []).map((entrant) => entrant.name).join('\n'),
    winner: state.phase === 'result' && state.winner ? state.winner.name : '',
    timeLeft: state.phase === 'collecting' && state.endsAt ? formatRouletteCountdown((state.endsAt - Date.now()) / 1000) : ''
  }
}

// The FULL text a Text node should show when its own Content socket is
// fed by a Roulette Entrants node's Content output — null when it
// isn't wired in. Unlike audioContentValues (which only ever SUPPLIES
// placeholder values a template still decides how to use), this
// REPLACES the Text's template outright, same priority buildImage
// gives Audio Player's Content wire over a set URL — see
// rouletteEntrantRows' own doc comment for the row-formatting tokens,
// and TextNode.tsx's own doc comment for why its textarea goes
// read-only once this is wired. Reads the CONNECTED ENTRANTS NODE's
// own rowTemplate/layout/sortByChance/separator fields, not this
// Text's. Mirrors rouletteEntrantsTextValue in overlays/sceneUtils.tsx,
// which instead reads the fixed SAMPLE_ROULETTE_STATE for the editor.
function rouletteEntrantsTextValue(nodeId, edges, map) {
  const edge = edges.find((e) => e.target === nodeId && e.targetHandle === 'content' && map[e.source] && map[e.source].type === 'rouletteEntrants')
  if (!edge) return null
  const entrantsData = (map[edge.source] && map[edge.source].data) || {}
  const rows = rouletteEntrantRows(latestRouletteState.entrants || [], entrantsData)
  const layout = entrantsData.layout || 'list'
  return layout === 'inline' ? rows.join(entrantsData.separator ?? ', ') : rows.join('\n')
}

// Whether ANY node in the graph has a live-data dependency on Roulette
// — mirrors hasAudioContentDeps' own reasoning exactly, just for the
// 'roulette-state' channel instead of 'now-playing'. Two shapes: a
// Roulette Widget's own `source`/`visible` socket (source is a
// 'rouletteSource' — its actual live wheel data, or whether it should
// be showing at all right now, see rouletteWidgetVisible below), or a
// Text node's own `content` socket fed by a Roulette Entrants node
// (source is 'rouletteEntrants' — see rouletteEntrantsTextValue
// above). Either means SOMETHING needs a live refresh on every tick.
function hasRouletteContentDeps(overlay) {
  const edges = overlay?.edges || []
  const nodes = overlay?.nodes || []
  const map = nodeMap(nodes)
  return edges.some((e) => {
    const src = map[e.source]
    if (!src) return false
    if (src.type === 'rouletteSource' && (e.targetHandle === 'source' || e.targetHandle === 'visible')) return true
    if (src.type === 'rouletteEntrants' && e.targetHandle === 'content') return true
    return false
  })
}

// Whether a Roulette Widget node should currently be rendered at all —
// true unconditionally unless its own `visible` socket is wired to a
// Roulette (see ROULETTE_WIDGET_SOCKETS in components/nodes/
// constants.ts), in which case it follows that round's own phase:
// visible for as long as it isn't 'idle'. Mirrors RouletteWidgetNode's
// own doc comment in components/nodes/RouletteWidgetNode.tsx.
function rouletteWidgetVisible(nodeId, edges, map) {
  const wired = edges.some((e) => e.target === nodeId && e.targetHandle === 'visible' && map[e.source] && map[e.source].type === 'rouletteSource')
  return !wired || latestRouletteState.phase !== 'idle'
}

// One formatted row per entrant — mirrors rouletteEntrantRows in
// overlays/sceneUtils.tsx (own doc comment there covers the shared
// reasoning; {name}/{chance}/{weight} tokens via the same interpolate()
// every other template field here already uses).
function rouletteEntrantRows(entrants, data) {
  const totalWeight = entrants.reduce((sum, entrant) => sum + entrant.weight, 0)
  const ordered = data.sortByChance ? [...entrants].sort((a, b) => b.weight - a.weight) : entrants
  const template = data.rowTemplate || '{name}'
  return ordered.map((entrant) => {
    const chance = totalWeight > 0 ? Math.round((entrant.weight / totalWeight) * 100) : 0
    return interpolate(template, { name: entrant.name, chance, weight: entrant.weight })
  })
}

// { number, numbers, hash, seed } sourced straight from
// `latestRandomState` (the always-current global, NOT this render's
// own `vars`) when Random's own Content output feeds this Text's own
// Content socket, or null when it isn't wired in — same placeholder-
// MERGE shape as audioContentValues above (own doc comment covers the
// shared reasoning): this only ever supplies values a template still
// decides how to use, so the Text's own textarea stays fully editable
// (unlike Roulette Entrants' REPLACE-outright wire). `number` is the
// first rolled value; `numbers` space-joins all of them, for a multi-
// roll. `seed` stays empty until revealed (RandomEngine only discloses
// it in RandomEngine.reveal). Mirrors randomContentValues in
// pages/overlays/sceneUtils.tsx, which instead reads the fixed
// SAMPLE_RANDOM_STATE for the editor.
function randomContentValues(nodeId, edges, map) {
  const hasRandomContent = edges.some((e) => e.target === nodeId && e.targetHandle === 'content' && map[e.source] && map[e.source].type === 'randomSource')
  if (!hasRandomContent) return null
  const numbers = latestRandomState.numbers || []
  return {
    number: numbers[0] ?? '',
    numbers: numbers.join(' '),
    hash: latestRandomState.hash || '',
    seed: latestRandomState.seed || ''
  }
}

// Whether ANY node in the graph has a live-data dependency on Random —
// mirrors hasRouletteContentDeps above exactly, just for the
// 'random-state' channel. Two shapes: a Random Widget's own
// `source`/`visible` socket, or a Text node's own `content` socket fed
// directly by Random's own Content output (see randomContentValues
// above).
function hasRandomContentDeps(overlay) {
  const edges = overlay?.edges || []
  const nodes = overlay?.nodes || []
  const map = nodeMap(nodes)
  return edges.some((e) => {
    const src = map[e.source]
    if (!src) return false
    return src.type === 'randomSource' && (e.targetHandle === 'source' || e.targetHandle === 'visible' || e.targetHandle === 'content')
  })
}

// Whether a Random Widget node should currently be rendered at all —
// true unconditionally unless its own `visible` socket is wired to a
// Random (see RANDOM_WIDGET_SOCKETS in components/nodes/constants.ts),
// in which case it follows that roll's own phase: visible for as long
// as it isn't 'idle'. Mirrors rouletteWidgetVisible above.
function randomWidgetVisible(nodeId, edges, map) {
  const wired = edges.some((e) => e.target === nodeId && e.targetHandle === 'visible' && map[e.source] && map[e.source].type === 'randomSource')
  return !wired || latestRandomState.phase !== 'idle'
}
