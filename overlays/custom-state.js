// The URL itself is /overlays/<urlKey>.html — the server always serves this
// same file for any such path (see OverlayServer.handleRequest), so which
// scene to render is read off our own location, not a query string.
const key = decodeURIComponent((location.pathname.match(/\/overlays\/([^/]+)\.html$/) || [])[1] || '')

const sceneEl = document.getElementById('scene')

const missingEl = document.getElementById('missing')

const bg = document.getElementById('bg')

const paratrooperEffect = window.OverlayParatrooperEffect.setup(bg)

const airdropEffect = window.OverlayAirdropEffect.setup(bg)

// The last overlay config seen (from fetch or 'custom-overlay-config') —
// kept at this scope so the 'alert' handler (a real event, arriving any
// time) always has the current graph to render against, and so render()
// itself can re-check it. See render()/showTriggeredContent() below.
let latestOverlay = null

// setTimeout id for the current event-triggered show's auto-hide — also
// doubles as "is something currently showing" (see render()'s idle branch).
let hideTimer = null

// setTimeout ids for a currently-playing Process's per-task-moment callbacks — see showProcessContent.
let processTimers = []

// True while an alert (plain-trigger or Process) is on screen — see
// handleAlert/processNextAlert. A second alert arriving while this is
// true no longer clobbers the first mid-animation; it queues instead.
let alertActive = false

// FIFO of alert payloads waiting for the current one to finish — see
// handleAlert. Capped so a flood of events (a raid + a pile of subs at
// once) can't grow this unboundedly; the oldest still-unplayed ones
// matter more than a long tail, so newer overflow is what's dropped.
let alertQueue = []

const MAX_QUEUED_ALERTS = 5

// Last payload seen on the 'now-playing' channel — see isAudioTrigger/
// showAudioContent/audioContentValues. Defaults to not-playing so a
// scene with an Audio Player wired in starts hidden until the feed
// says otherwise — immediately overwritten with the CURRENT snapshot
// (if any) by the now-playing.json fetch below, so this default is
// only ever actually used if that fetch fails.
let latestNowPlaying = { isPlaying: false }

// Whether an Audio-Player-driven scene is currently on screen — see
// showAudioContent/hideAudioContent. Separate from hideTimer, which is
// alert-specific (a fixed durationMs); Now Playing has no such timer,
// it stays up for as long as isPlaying does.
let audioVisible = false

// Last payload seen on the 'roulette-state' channel — see
// rouletteEntrantsTextValue/rouletteWidgetVisible/buildRouletteWheel.
// Defaults to idle/no entrants; immediately overwritten with the
// CURRENT snapshot (if any) by the roulette-state.json fetch below,
// same as latestNowPlaying above.
let latestRouletteState = { phase: 'idle', entrants: [], winner: null }

// Last payload seen on the 'random-state' channel — see
// randomContentValues/randomWidgetVisible/buildRandomWidget. Defaults
// to idle/no numbers; immediately overwritten with the CURRENT
// snapshot (if any) by the random-state.json fetch below, same as
// latestRouletteState above. Unlike Roulette, there's no periodic
// client-side poll to keep this "ticking" — RandomEngine's commit and
// reveal are each already a discrete broadcast (reveal stays 'revealed'
// indefinitely now, until the next commit — no auto-idle timer), so
// every state change this needs to react to already arrives as its
// own 'random-state' WS message.
let latestRandomState = { phase: 'idle', hash: null, numbers: null, seed: null, min: 0, max: 0, count: 1 }

// Per auto-scrolling node (keyed by node id): when its loop FIRST
// started, and the measured size/duration its CURRENT pace is based
// on — deliberately module-level (survives renderStatic's own
// sceneEl.innerHTML = '' wipe-and-rebuild), NOT reset per render. A
// live-data tick (ensureRouletteCountdownTicking's 1s poll while a
// Roulette round is collecting, or a plain content Save) calls
// render()->renderStatic() far more often than one auto-scroll loop
// takes to complete, tearing down and rebuilding the whole #scene DOM
// each time.
//
// `startedAt` alone isn't enough: without also PINNING `durationSec`
// once measured, applyAutoScrollContent recomputed it fresh from a
// brand-new getBoundingClientRect() on every single rebuild — and
// real layout isn't perfectly bit-identical rebuild to rebuild (a
// fraction-of-a-pixel difference is enough), so the modulo phase math
// (elapsedSec % durationSec) was landing at a SLIGHTLY different point
// than where the torn-down track visually actually was each time.
// Individually invisible, but compounding once a second for the
// length of a whole loop reliably drifted enough to show up as a
// visible snap right around when a lap would otherwise complete —
// exactly the "jumps to the start" symptom. Pinning `size`/
// `durationSec` the first time and only ever touching them again when
// the measured size ACTUALLY changes by a whole pixel (a real content
// change — e.g. Roulette Entrants gaining a row — not layout noise)
// keeps the phase math exact across every rebuild in between. See
// applyAutoScrollContent's own use of this.
const autoScrollState = {}
