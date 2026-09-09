/**
 * The node graph has two independent kinds of edges (data/composition vs.
 * sequence-flow) and groups input sockets by role, Blender-modifier-stack
 * style — see docs/events-system.md's "Node Graph Data Model" section for
 * the full picture before changing InputSocket/OutputSocket below, or the
 * per-type socket arrays further down (NODE_SOCKETS/NODE_OUTPUTS themselves
 * are no longer hand-written here — see NodeDefinition/NODE_DEFINITIONS in
 * index.tsx, which derives both from these arrays plus each type's
 * component/category/defaults in one place).
 */

/**
 * One labeled input socket on a node — Blender-style: a modifier that
 * overrides a specific ROLE (Transform, Style, ...) plugs into the socket
 * for that role, instead of every wire piling onto one shared dot. `accepts`
 * is enforced by isValidConnection in SceneBuilderPage.tsx (shared from
 * NODE_SOCKETS so BaseNode's rendering and connection validation never
 * drift) — a role socket typically accepts SEVERAL node types (e.g.
 * Transform accepts Position, Size, AND Transform), any combination of which
 * can be wired in at once. `multi` (default false): a single-value socket
 * auto-replaces its existing wire when a new one is dropped on it (see
 * onConnect in SceneBuilderPage.tsx) — same behavior Blender uses for
 * single-value inputs. `multi: true` (Box's children, Scene's content, and
 * every grouped modifier role below) is a list: any number of wires, of any
 * mix of the types `accepts` lists — see MODIFIER_SOCKETS below, and
 * modifierStyle's own doc comment in SceneBuilderPage.tsx for how duplicate
 * fields within one group resolve (last-wired wins).
 */
/** Shared by InputSocket/OutputSocket's own `kind` — 'process' only ever appears on an OUTPUT socket (Condition's Then/Else, see CONDITION_OUTPUTS below); no INPUT socket needs it since the sequence-flow target ("event-in") is rendered by BaseNode's own `sequenceIn` row, not through NODE_SOCKETS. */
export type SocketKind = 'content' | 'style' | 'data' | 'process'

/** Dot color only (`kind`) — reuses the CATEGORY_STYLES palette so a socket's color hints at what kind of node it accepts. `multi` defaults to false (a single-value socket) — see this class's own file-header doc comment above for what that governs. */
export class InputSocket {
  constructor(
    public id: string,
    public label: string,
    public accepts: string[],
    public kind: SocketKind,
    public multi = false
  ) {}
}

/**
 * The two grouped "modifier" roles shared by Text/Image/Video/Box (and,
 * minus Hide, by Task — see TASK_SOCKETS): Transform (Position + Size +
 * Transform/scale+rotate — anything that changes WHERE or HOW BIG something
 * is) and Style (Opacity + Shadow + Animation + Hide + Overflow + Spacing —
 * anything that changes how it LOOKS, whether it shows at all, or how much
 * room it takes/leaves). Each is `multi: true`: wire in a Position AND a
 * Size AND a Transform node together to get all three at once, same as
 * before these were separate sockets — see modifierStyle's own doc comment
 * in sceneUtils/style.ts for how the values combine (and how a second wire
 * of the SAME type in one group is resolved). Spacing (padding/margin) is
 * build-time only, like Overflow — neither is in TASK_SOCKETS' own narrower
 * Style list, so a Task can't override either mid-process.
 */
export const MODIFIER_SOCKETS: InputSocket[] = [
  new InputSocket('transform', 'Transform', ['position', 'size', 'transform'], 'style', true),
  new InputSocket('style', 'Style', ['opacity', 'shadow', 'animation', 'hide', 'overflow', 'spacing'], 'style', true)
]

// Lets an Audio Player's Content output (see AUDIO_PLAYER_OUTPUTS below) be
// wired straight into a specific Text node instead of only reaching it
// indirectly via {title}/{artist} placeholders in its Content field. Unlike
// a plain modifier socket, wiring in doesn't replace Content — it just
// supplies the values Content's OWN {artist}/{title} placeholders resolve
// to for this node (see buildText's own doc comment in overlays/
// custom.html), so the field you actually edit is still Content's textarea.
// `multi: true` since more than one producer can genuinely feed this at
// once — Roulette Entrants (a full REPLACE, see rouletteEntrantsTextValue in
// overlays/sceneUtils.tsx) alongside Audio Player (a placeholder MERGE) is
// an unusual combination but not a meaningless one. kind 'content' (not
// 'data') despite only ever accepting data-category nodes — this socket IS
// content (a value feeding Content's own template/replacement), same family
// as Box's 'children'/Scene's own 'content' socket, so its dot reads green
// like theirs instead of the data-source violet/sky-blue tint.
export const TEXT_SOCKETS: InputSocket[] = [
  new InputSocket('content', 'Content', ['audioPlayer', 'rouletteEntrants', 'randomSource', 'clock'], 'content', true),
  ...MODIFIER_SOCKETS
]
// The mandatory Roulette Widget's own two inputs — Source (accepts ONLY
// 'rouletteSource', single-value: exactly the ONE Roulette node it was
// auto-paired with — see addNode's own doc comment in hooks/useSceneGraph.ts)
// and Visibility (optional — Roulette's own Event output, see
// ROULETTE_OUTPUTS below). kind 'content' for Source (same reasoning as
// TEXT_SOCKETS' own Content socket above — it IS the content this node
// renders, despite only ever accepting a 'data'-category node); kind 'data'
// for Visibility (a trigger/state signal, not a value).
export const ROULETTE_WIDGET_SOCKETS: InputSocket[] = [
  new InputSocket('source', 'Source', ['rouletteSource'], 'content'),
  new InputSocket('visible', 'Visibility', ['rouletteSource'], 'data'),
  ...MODIFIER_SOCKETS
]
// A Roulette Entrants list's own single input — same `source` id/shape as
// the Widget's above, but this node is a totally ordinary, optional,
// user-placed DATA node (see NODE_CATEGORY.rouletteEntrants below), not a
// structural one — no Transform/Style sockets, it has nothing of its own to
// position: its formatted rows feed straight into a Text node's own Content
// socket instead (see ROULETTE_ENTRANTS_OUTPUTS below), which is what
// actually gets positioned/styled. No `visible` socket either, no locked/
// mandatory pairing — deleting it just deletes it (see addNode's own doc
// comment in hooks/useSceneGraph.ts for how its creation differs from the
// Widget's).
export const ROULETTE_ENTRANTS_SOCKETS: InputSocket[] = [new InputSocket('source', 'Source', ['rouletteSource'], 'content')]
// Same pairing shape as ROULETTE_WIDGET_SOCKETS above: a Random Widget's own
// Source is locked to the ONE Random node it was auto-paired with (see
// addNode's own doc comment in hooks/useSceneGraph.ts), Visibility is the
// same Random's own Event output (see RANDOM_OUTPUTS below) wired in to hide
// THIS widget outside an active roll instead of it always showing. Unlike
// Roulette, Random has no second auto-created node — its Content output
// wires DIRECTLY into a Text node's own Content socket instead (a
// placeholder merge, same shape as Audio Player's own Content wire — see
// TEXT_SOCKETS above / randomContentValues in overlays/sceneUtils.tsx), so
// there's nothing here for a separate node to own.
export const RANDOM_WIDGET_SOCKETS: InputSocket[] = [
  new InputSocket('source', 'Source', ['randomSource'], 'content'),
  new InputSocket('visible', 'Visibility', ['randomSource'], 'data'),
  ...MODIFIER_SOCKETS,
  // Same Ordering socket Box/Scene have (see BOX_SOCKETS above) — controls
  // how the rolled numbers lay out relative to EACH OTHER (row/column, gap)
  // once Count is above 1. Not needed at all for a single number; matters
  // once there's more than one to arrange, same as it would for any other
  // multi-item layout — see RandomWidgetView in overlays/views/index.tsx /
  // buildRandomWidget in overlays/custom.html.
  new InputSocket('ordering', 'Layout', ['ordering'], 'style')
]
// Node types allowed into a container's `children` socket — shared by
// BOX_SOCKETS, RANDOM_PICK_SOCKETS, and IMAGE_SOCKETS/VIDEO_SOCKETS' own
// `children` below (see BOX_SOCKETS' own doc comment for why Image/Video can
// hold this same set: they render their media as a backdrop, same as Box's
// background, with these children stacked on top via the same Ordering-driven
// layout — see ImageView/VideoView's own doc comments).
const CONTAINER_CHILD_TYPES = ['text', 'image', 'video', 'progress', 'equalizer', 'box', 'group', 'randomPick', 'rouletteWidget', 'randomWidget']

// Same "Content" concept as TEXT_SOCKETS' own socket above, but for Image:
// wiring Audio Player's Content output in shows the live now-playing album
// art unconditionally (see buildImage's own doc comment), taking priority
// over a set URL/uploaded image — ImageNode's own URL field goes read-only
// while this is connected, since the connection already decides what's
// shown. Own id (not 'content') purely so a Text's Content socket and this
// one read as visibly different rows despite the identical label — the SAME
// Content output can reach either (see AUDIO_PLAYER_OUTPUTS' own `feeds`).
//
// `children` (own doc comment above) lets an Image/Video act as a container
// too, same as Box — its media renders as a backdrop with these children
// laid out on top of it (ImageView/VideoView), rather than only being
// placeable INSIDE some other container. `ordering` controls that layout the
// same way it does for Box.
export const IMAGE_SOCKETS: InputSocket[] = [
  new InputSocket('imageContent', 'Content', ['audioPlayer'], 'content'),
  new InputSocket('children', 'Children', CONTAINER_CHILD_TYPES, 'content', true),
  ...MODIFIER_SOCKETS,
  new InputSocket('ordering', 'Layout', ['ordering'], 'style')
]
export const VIDEO_SOCKETS: InputSocket[] = [
  new InputSocket('children', 'Children', CONTAINER_CHILD_TYPES, 'content', true),
  ...MODIFIER_SOCKETS,
  new InputSocket('ordering', 'Layout', ['ordering'], 'style')
]
/**
 * A Progress Bar's own sockets: Label (optional — wire a Text node in to
 * caption the bar with THAT node's own full styling: color/font/size/align/
 * bold/italic, not just its plain text — see ProgressView/buildProgress,
 * which render the wired Text node directly rather than reading only its
 * `.data.text` the way BackgroundAnimation's own Caption socket does).
 * Socket id is 'caption', not 'label' — it has to match one of Text's own
 * NODE_OUTPUTS entries' `feeds` list (see isValidConnection in
 * hooks/useSceneGraph.ts, which checks BOTH the target socket's `accepts`
 * AND the specific dragged-from output socket's `feeds`), and Text's single
 * Content output already covers this role (`feeds` includes 'caption'
 * alongside 'children'/'content' — see CONTENT_OUTPUT below) — reusing it
 * here means dragging from that same row Just Works, the same one row
 * that's already used to place a Text as ordinary content. The user-visible
 * `label` field below is independent of `id` and still reads "Label" on the
 * node itself.
 * Current/Target (each a single wired Variable node's `.data.value` — see
 * VariableNode — 0 when nothing's wired into a socket, same as any other
 * unwired optional input), plus the same Transform/Style modifiers every
 * other leaf content node takes.
 */
export const PROGRESS_SOCKETS: InputSocket[] = [
  new InputSocket('caption', 'Label', ['text'], 'content'),
  new InputSocket('current', 'Current', ['variable'], 'data'),
  new InputSocket('target', 'Target', ['variable'], 'data'),
  ...MODIFIER_SOCKETS
]

/**
 * An Equalizer's own single input — Source (accepts ONLY 'audioSource',
 * single-value: exactly one capture device feeds one Equalizer's bars) plus
 * the same Transform/Style modifiers every other leaf content node takes.
 * Real audio capture happens in the Electron app itself, not inside this
 * OBS-loaded page (see AudioSourceNode's own doc comment for why) — the
 * wired Audio Source node only carries WHICH device's levels this bar/wave/
 * dot visual should track, resolved at render time in overlays/
 * custom-builders.js's buildEqualizer via `mods.find(n => n.type ===
 * 'audioSource')`, same "unambiguous by type" convention Progress's own
 * Label socket uses for its wired Text.
 */
export const EQUALIZER_SOCKETS: InputSocket[] = [
  new InputSocket('source', 'Audio Source', ['audioSource'], 'data'),
  ...MODIFIER_SOCKETS
]

/**
 * An Audio Source's own single OPTIONAL input — same `content` id/shape as
 * TEXT_SOCKETS'/IMAGE_SOCKETS' own Content sockets (see TEXT_SOCKETS' own
 * doc comment for why `kind: 'content'` despite only ever accepting a
 * 'data'-category node), so it's already covered by AUDIO_PLAYER_OUTPUTS'
 * existing Content output `feeds` list with no changes needed there. Wiring
 * Audio Player's Content output in here makes the Equalizer this Audio
 * Source feeds pulse with playback (isPlaying true/false) instead of a real
 * device/OBS feed — see buildEqualizer's own `playbackDriven` check in
 * overlays/custom-builders.js for how this is resolved (a second
 * `incoming()` lookup off the Audio Source node itself, since this wire
 * lands one hop away from the Equalizer, and doesn't care which socket id
 * it landed on). Once wired, AudioSourceNode.tsx's own Device field goes
 * read-only and shows "Content" — same "the wire already decided, an
 * editable-but-ignored field would just be confusing" precedent as
 * ImageNode's own URL field for the identical Content wire. Left unwired
 * (the common case), nothing changes — the node's own sourceKind picker
 * (device/OBS) still decides everything, same as before this socket
 * existed.
 */
export const AUDIO_SOURCE_SOCKETS: InputSocket[] = [new InputSocket('content', 'Content', ['audioPlayer'], 'content')]
/**
 * Shared by Box AND Group (see GroupNode's own doc comment for how the two
 * differ) — accepts 'box'/'group' too, either one nesting either one (see
 * buildBox's recursion in overlays/custom.html / BoxView's in
 * SceneBuilderPage.tsx, both of which handle Box/Group identically except
 * for the decorative background/padding/border/shape fields Group simply
 * doesn't have), so a card can hold, say, a horizontal row of two
 * sub-containers instead of only flat Text/Image children. A container's
 * own Ordering/Position/Transform/Animation still apply to it normally once
 * nested, same as at the top level.
 */
export const BOX_SOCKETS: InputSocket[] = [
  new InputSocket('children', 'Children', CONTAINER_CHILD_TYPES, 'content', true),
  ...MODIFIER_SOCKETS,
  new InputSocket('ordering', 'Layout', ['ordering'], 'style')
]

/**
 * A Random Pick node's own single input — same id ('children') as Box's own
 * above so it reuses CONTENT_OUTPUT's existing `feeds` list unchanged
 * (see CONTENT_OUTPUT below) rather than needing a whole separate output
 * role — every content node's plain "wire it in to place it" output already
 * lands here. Accepts the SAME set Box's own `children` does, `randomPick`
 * included: a Random Pick node can nest another one as one of its own
 * options (see MAX_BOX_DEPTH-style depth capping in pickRandomVariant's own
 * callers). Which ONE of these actually renders is resolved by
 * pickRandomVariant (pages/overlays/sceneUtils/graph.ts) — see
 * RandomPickNode/RandomPickView's own doc comments for the rest.
 */
export const RANDOM_PICK_SOCKETS: InputSocket[] = [new InputSocket('children', 'Options', CONTAINER_CHILD_TYPES, 'content', true)]

export const SCENE_SOCKETS: InputSocket[] = [
  new InputSocket('content', 'Content', ['box', 'group', 'text', 'image', 'video', 'progress', 'equalizer', 'randomPick', 'rouletteWidget', 'randomWidget'], 'content', true),
  // kind 'data', not 'style' — Background FX is category 'data' (see its own
  // doc comment below), so this socket's dot/wire should match ITS color,
  // not the per-component style modifiers (Position/Animation/...) it has
  // nothing to do with.
  new InputSocket('backgroundFx', 'Background FX', ['backgroundAnimation'], 'data'),
  new InputSocket('sound', 'Sound', ['sound'], 'data'),
  new InputSocket('ordering', 'Layout', ['ordering'], 'style'),
  // Accepts 'audioPlayer' too, via its own Event output (see
  // AUDIO_PLAYER_OUTPUTS below) — same convention as Start's own Event
  // socket. Wiring Audio Player in here marks the scene as continuously
  // data-driven (see isAudioTrigger in overlays/custom.html) rather than
  // one-shot event-triggered, visible for as long as isPlaying is true with
  // no durationMs/auto-hide, and (as a bonus) arms {title}/{artist}/
  // {albumArt} placeholders scene-wide. A Text/Image's own Content socket
  // gets live values with no Scene wiring at all — this only matters if you
  // also want the whole scene to show/hide by playback state. Single-value
  // like Start's, so an Event node and Audio Player can't both drive Scene
  // at once — wiring the second replaces the first, same as everywhere else
  // a socket isn't `multi`. Roulette deliberately does NOT get the same
  // scene-wide entry here — its own Widget shows unconditionally by default
  // (see NODE_SOCKETS.rouletteWidget's own `visible` socket) rather than
  // hiding the whole scene until a round starts.
  new InputSocket('event', 'Event', ['event', 'audioPlayer'], 'data'),
  new InputSocket('timer', 'Timer', ['timer'], 'data')
]

export const BACKGROUND_FX_SOCKETS: InputSocket[] = [new InputSocket('caption', 'Caption', ['text'], 'content')]

export const START_SOCKETS: InputSocket[] = [
  // Accepts 'audioPlayer' too, via its own Event output (see
  // AUDIO_PLAYER_OUTPUTS below) — an alternative to an Event node for
  // arming a process: fires on a track change instead of matching a real
  // alert's type. See processTrigger's audioArmed in overlays/custom.html.
  new InputSocket('event', 'Event', ['event', 'audioPlayer', 'rouletteSource', 'randomSource'], 'data'),
  new InputSocket('sound', 'Sound', ['sound'], 'data'),
  new InputSocket('backgroundFx', 'Background FX', ['backgroundAnimation'], 'data')
]

export const TASK_SOCKETS: InputSocket[] = [
  new InputSocket('target', 'Target', ['text', 'image', 'box', 'group', 'video', 'progress', 'rouletteWidget'], 'content'),
  // Same Transform/Style grouping as MODIFIER_SOCKETS, minus Hide (a Task's
  // visibility is already its own show/hide Action field, not a separate
  // modifier) — these are what THIS step changes, layered on top of the
  // target's own base Transform/Style at the moment the step fires. See
  // computeTaskState's own doc comment in SceneBuilderPage.tsx.
  new InputSocket('transform', 'Transform', ['position', 'size', 'transform'], 'style', true),
  new InputSocket('style', 'Style', ['opacity', 'shadow', 'animation'], 'style', true),
  // A Task's own one-shot cue — plays once when THIS step fires (e.g. a
  // cash-register sound only when the donation amount appears), distinct
  // from Start's Sound (fires once at the process's very beginning). See
  // buildProcessSchedule/showProcessContent's own doc comments for how a
  // step's sound gets collected and played.
  new InputSocket('sound', 'Sound', ['sound'], 'data')
]

/**
 * One labeled OUTPUT socket — the output-side mirror of InputSocket, for the
 * few node types whose single output otherwise fans out to genuinely
 * different roles (a Box feeding both Scene's `content`, structurally, and
 * a Task's `target`, as what that step controls — previously both wires
 * left the same unlabeled dot). Most node types have exactly one role for
 * their output (a Position modifier is always "a position", regardless of
 * which target it lands on) and keep the plain single "output" handle —
 * see BaseNode's `outputSockets` prop, only set for the types with an
 * entry in NODE_OUTPUTS (index.tsx).
 * `feeds`: which target INPUT socket ids this output is meant to connect
 * to, enforced by isValidConnection in SceneBuilderPage.tsx exactly like
 * InputSocket.accepts is on the input side. `helpKey`: an optional key into
 * the `sceneBuilder.tooltip.outputs` localization namespace (see
 * localization/en.json) rendered as a "?" popover on the row itself, same
 * mechanism as BaseNode's own header `help` — see OutputRow — for spelling
 * out exactly what THIS output does and where to wire it, so the node's
 * header help can stay a short one-liner about the node as a whole instead
 * of cramming every output's behavior into one popover.
 */
export class OutputSocket {
  constructor(
    public id: string,
    public label: string,
    public kind: SocketKind,
    public feeds: string[],
    public helpKey?: string
  ) {}
}

/**
 * The "place this node's rendered output somewhere" role — used to be two
 * separate rows, Structural (feeds: ['children', 'content'] — a container's
 * Children or a top-level Content socket) and Text-only As Caption (feeds:
 * ['caption'] — an effect's Caption/a Progress Bar's Label socket). They
 * were never SIMULTANEOUSLY-needed roles the way Structural+As Target are (a
 * component needs BOTH a Structural wire to exist at all AND a Target wire
 * for a Task to separately control it) — Caption was always an ALTERNATIVE
 * destination for the exact same underlying concept, just captioning
 * something instead of being placed as ordinary content, so one merged row
 * (feeds is the union of both) loses no real distinction and just means
 * fewer dots to pick between. See migrateLegacyContentOutputEdges in
 * sceneUtils/legacyMigrations.ts for the old 'structural'/'caption'
 * sourceHandle remap this required.
 */
export const CONTENT_OUTPUT: OutputSocket = new OutputSocket('content', 'Content', 'content', ['children', 'content', 'caption'], 'content')
export const TARGET_OUTPUT: OutputSocket = new OutputSocket('target', 'As Target', 'content', ['target'], 'target')

export const TEXT_OUTPUTS: OutputSocket[] = [CONTENT_OUTPUT, TARGET_OUTPUT]
export const IMAGE_OUTPUTS: OutputSocket[] = [CONTENT_OUTPUT, TARGET_OUTPUT]
export const VIDEO_OUTPUTS: OutputSocket[] = [CONTENT_OUTPUT, TARGET_OUTPUT]
export const PROGRESS_OUTPUTS: OutputSocket[] = [CONTENT_OUTPUT, TARGET_OUTPUT]
export const EQUALIZER_OUTPUTS: OutputSocket[] = [CONTENT_OUTPUT, TARGET_OUTPUT]
export const BOX_OUTPUTS: OutputSocket[] = [CONTENT_OUTPUT, TARGET_OUTPUT]

/**
 * An Audio Source's single role: the live level feed for whichever
 * Equalizer's own `source` socket it's wired into (see EQUALIZER_SOCKETS
 * above) — `kind: 'data'` (not 'content') since this is a state/level
 * signal, not a value feeding a template the way Audio Player's own Content
 * output does. Real capture (getUserMedia/AnalyserNode) happens once, in the
 * Electron app's own hidden capture window (see main/audioCapture.ts) —
 * never inside this OBS-loaded page, which only ever renders band levels
 * it's handed over the same WebSocket broadcast Now Playing/global
 * variables already use (see OverlayServer.pushAudioLevels). This node just
 * carries WHICH device's levels that is.
 */
export const AUDIO_SOURCE_OUTPUTS: OutputSocket[] = [new OutputSocket('content', 'Level', 'data', ['source'], 'audioSourceContent')]

/**
 * Clock's single role: the `{time}` placeholder for whichever Text socket
 * it's wired into (its own Format field decides what's IN that string —
 * "14:30:00" vs. "02.09.2026" — the receiving Text still decides how it
 * LOOKS, same as Audio Player's own Content wire's own `{artist}`/`{title}`
 * split). `kind: 'content'` (not the node's own 'data' category) so this
 * wire reads green like the Content sockets it feeds, matching
 * AUDIO_PLAYER_OUTPUTS' own reasoning exactly. Not Content/Target like
 * Text/Image/Box's outputs — Clock has no visual presence of its own
 * anymore to place in Scene/a Box/a Task, only this one value to supply.
 */
export const CLOCK_OUTPUTS: OutputSocket[] = [new OutputSocket('content', 'Content', 'content', ['content'], 'clockContent')]

/**
 * Audio Player's two roles for its single Now Playing feed, collapsed from
 * five separate outputs into these — one wire per role covers everything a
 * consumer on that side could want, instead of picking which of several
 * near-identical dots to wire in. Content carries Cover+Artist+Title
 * bundled together: wired into a Text node's Content socket (id `content` —
 * see TEXT_SOCKETS above) it fills {artist}/{title} in that node's own
 * template (see audioContentValues in overlays/custom.html); wired into an
 * Image node's Content socket (id `imageContent`) it shows the live album
 * art instead, unconditionally (Image has no placeholder template of its
 * own to merge into) — which fields actually apply is decided by which
 * socket it lands on, not by which wire you dragged. Event carries the
 * track-change/now-playing signal itself: wired into a Start node's own
 * Event socket (see START_SOCKETS above) it arms a process on a TRACK
 * CHANGE rather than matching a real alert's type (see processTrigger's
 * audioArmed in overlays/custom.html); wired into Scene's own Event socket
 * (see SCENE_SOCKETS above — same id, same socket a real Event node uses)
 * it's the whole-scene visibility switch (show/hide by isPlaying) instead —
 * same "one wire, meaning depends on where it lands" idea. Both Start's and
 * Scene's Event sockets can be wired into at once (fan-out from one output
 * handle needs no `multi` flag — see InputSocket's own doc comment for why
 * that flag only matters on the INPUT side); Scene's Event socket itself is
 * still single-value, so it can't ALSO have a real Event node wired in at
 * the same time. Skipping either entirely still works exactly as before —
 * see AudioPlayerNode's own doc comment.
 */
export const AUDIO_PLAYER_OUTPUTS: OutputSocket[] = [
  // kind 'content' (not 'data') to match the Content sockets it feeds — see
  // TEXT_SOCKETS/IMAGE_SOCKETS' own comments, and displayEdges' own doc
  // comment in SceneBuilderPage.tsx for how this colors the wire green
  // despite the node's own 'data' category.
  new OutputSocket('content', 'Content', 'content', ['content', 'imageContent'], 'audioContent'),
  // kind 'data': a trigger/state signal, not a value feeding a template.
  new OutputSocket('event', 'Event', 'data', ['event'], 'audioEvent')
]

/**
 * Roulette's two roles for its single live feed — same "one wire, meaning
 * depends on where it lands" idea as AUDIO_PLAYER_OUTPUTS above, but Content
 * here is NOT itself a placeable structural component, and doesn't feed a
 * Text node directly either — Roulette stays a pure data/control node, same
 * family as Audio Player/Event. Rendering is instead handled by two separate
 * downstream nodes, both auto-created and paired the moment a Roulette node
 * is placed (see addNode's own doc comment in hooks/useSceneGraph.ts): the
 * mandatory Roulette Widget (the wheel — see NODE_SOCKETS.rouletteWidget/
 * ROULETTE_WIDGET_OUTPUTS below), and the optional Roulette Entrants list
 * (see NODE_SOCKETS.rouletteEntrants/ROULETTE_ENTRANTS_OUTPUTS below) — an
 * ordinary, freely deletable node whose OWN Content output in turn feeds a
 * Text node (see ROULETTE_ENTRANTS_OUTPUTS' own doc comment). Content here
 * only ever feeds that shared `source` pairing socket — the Widget's link is
 * permanent, the Entrants list's isn't. Event carries the round's phase
 * signal: wired into a Start node's own Event socket it arms a process the
 * moment a round starts collecting (the "launch" trigger, for e.g. playing a
 * sound/animation elsewhere — NOT the wheel itself, which shows
 * unconditionally by default); wired into a Roulette Widget's own `visible`
 * socket instead, it hides that SPECIFIC widget outside an active round
 * instead of showing it unconditionally. Both at once is fine — they're
 * independent sockets on independent nodes, same as Audio Player's own two.
 */
export const ROULETTE_OUTPUTS: OutputSocket[] = [
  new OutputSocket('content', 'Content', 'content', ['source'], 'rouletteContent'),
  new OutputSocket('event', 'Event', 'data', ['event', 'visible'], 'rouletteEvent')
]

/**
 * A Roulette Widget's own single Content/Target role — plain reuse of
 * CONTENT_OUTPUT/TARGET_OUTPUT, same shape as TEXT_OUTPUTS/IMAGE_OUTPUTS/
 * VIDEO_OUTPUTS/BOX_OUTPUTS above. Nothing Roulette-specific about the
 * OUTPUT side — what's special is entirely on the INPUT side (its own
 * `source`/`visible` sockets, see NODE_SOCKETS.rouletteWidget above) and in
 * how the node itself comes to exist (auto-paired, never placed by hand from
 * the palette — see addNode's own doc comment in hooks/useSceneGraph.ts).
 */
export const ROULETTE_WIDGET_OUTPUTS: OutputSocket[] = [CONTENT_OUTPUT, TARGET_OUTPUT]

/**
 * A Roulette Entrants list's own single output — unlike the Widget's above,
 * this ISN'T Content/Target (it's not independently placeable in Scene/a
 * Box/a Task) — it's a Content feed, same family as AUDIO_PLAYER_OUTPUTS'
 * own `content` role: wire it into a Text node's own Content socket to
 * REPLACE that Text's template outright with the formatted, joined entrants
 * list (see rouletteEntrantsTextValue in overlays/sceneUtils.tsx) — that
 * Text's own textarea goes read-only while connected, same as ImageNode's
 * URL field does for Audio Player's Content (see TextNode.tsx's own doc
 * comment), since there's no template left for it to contribute; Color/
 * Size/Font/Align/... all stay that Text's own normal fields — this node
 * only owns the row-by-row FORMATTING decisions (rowTemplate/layout/
 * sortByChance/separator, see NODE_DEFAULTS.rouletteEntrants), not how it
 * LOOKS once shown.
 */
export const ROULETTE_ENTRANTS_OUTPUTS: OutputSocket[] = [new OutputSocket('content', 'Content', 'content', ['content'], 'rouletteEntrantsContent')]

/**
 * Random's two roles for its single commit/reveal feed — same "one wire,
 * meaning depends on where it lands" shape as AUDIO_PLAYER_OUTPUTS above.
 * Content feeds EITHER the mandatory Random Widget's own `source` pairing
 * socket (the rolling numbers — see NODE_SOCKETS.randomWidget/
 * RANDOM_WIDGET_OUTPUTS below) OR a Text node's own Content socket (see
 * TEXT_SOCKETS above) directly — landing on Text merges {number}/{numbers}/
 * {hash}/{seed} into whatever template is already there (see
 * randomContentValues in overlays/sceneUtils.tsx), the SAME placeholder-
 * merge shape Audio Player's own Content wire uses for {artist}/{title},
 * not a replacement — that Text's own textarea stays fully editable. Event
 * carries the roll's phase signal: wired into a Start node's own Event
 * socket it arms a process the moment a roll is committed (a hash
 * published, before the numbers themselves are known — see
 * RandomEngine.commit); wired into a Random Widget's own `visible` socket
 * instead, it hides that SPECIFIC widget outside an active roll rather than
 * showing it unconditionally.
 */
export const RANDOM_OUTPUTS: OutputSocket[] = [
  new OutputSocket('content', 'Content', 'content', ['source', 'content'], 'randomContent'),
  new OutputSocket('event', 'Event', 'data', ['event', 'visible'], 'randomEvent')
]

/** A Random Widget's own single Content/Target role — same reuse of CONTENT_OUTPUT/TARGET_OUTPUT as ROULETTE_WIDGET_OUTPUTS above; nothing Random-specific about the output side. */
export const RANDOM_WIDGET_OUTPUTS: OutputSocket[] = [CONTENT_OUTPUT, TARGET_OUTPUT]

/**
 * A Condition's two branch roles — unlike every OutputSocket above (all
 * `kind: 'content'`, feeding a data/composition socket), these are
 * `kind: 'process'`: sequence-flow, same family as the plain generic
 * "output" handle every other Start/Task/Wait uses, just split into two
 * labeled rows instead of one. `feeds` lists 'event-in' for documentation
 * only — isValidConnection in hooks/useSceneGraph.ts short-circuits on
 * `targetHandle === 'event-in'` before ever consulting a source's own
 * NODE_OUTPUTS/feeds list, so either branch can already reach any process
 * node's sequence input regardless. Which branch is actually taken is
 * resolved by evaluateCondition (pages/overlays/sceneUtils/graph.ts) against
 * the SAME {user}/{amount}/{message}/{source} vars a Text/Image placeholder
 * already reads (see EVENT_PLACEHOLDERS in components/nodes/utils/
 * constants.ts) — missing context (no live alert, e.g. a process armed by
 * Audio Player/Roulette/Random instead) always falls to Else, never throws.
 */
export const CONDITION_OUTPUTS: OutputSocket[] = [
  new OutputSocket('then', 'Then', 'process', ['event-in'], 'conditionThen'),
  new OutputSocket('else', 'Else', 'process', ['event-in'], 'conditionElse')
]

/**
 * What kind of thing a node is, purely for visual grouping (header tint +
 * left accent stripe — see CATEGORY_STYLES/BaseNode) so the graph reads at
 * a glance instead of every node looking the same. Coarser than the palette's
 * own groups (see NODE_PALETTE in pages/overlays/sceneBuilderConstants.ts,
 * which further splits 'data' into Live Data vs. Tools) — this is only the
 * canvas tint, several palette sections can and do share one category:
 *  - process: Start/Task/Wait/Condition/End — the sequence-flow chain.
 *  - content: Scene/Text/Image/Box/Random Pick — what exists and how it's
 *    nested (Random Pick included: it resolves to exactly one of its wired
 *    options, same "what exists" question, just decided by weighted chance
 *    instead of always all of them — see pickRandomVariant in pages/
 *    overlays/sceneUtils/graph.ts).
 *  - style: Position/Size/Transform/Animation/Hide/Overflow/Display/Ordering —
 *    per-component modifiers, wired into a SPECIFIC Text/Image/Box/Task.
 *  - data: Event/Audio Player/Sound/Timer/Background FX (self-contained
 *    scene/process-level accessories — event feeds, one-shot behavior,
 *    ambient config, activating alongside a trigger rather than reshaping a
 *    piece of content — see BackgroundAnimationNode's own doc comment for why
 *    it lives here despite the "FX" name) AND Random/Roulette (NOT
 *    self-contained — placing one only surfaces the live state of the
 *    matching app-level Tool, see RandomToolPage/RouletteToolPage; min/max/
 *    count/command/entryMode/etc. live on that Tool's own settings, not on
 *    the node).
 *
 * Assigned per type in NODE_DEFINITIONS (index.tsx), not hand-listed here —
 * see that file's own doc comment.
 */
export type NodeCategory = 'process' | 'content' | 'style' | 'data' | 'utils'

/** `dot`: solid bg-*-500, for small indicators (SocketRow's dots, the Add Node palette's group/button accents in SceneBuilderPage.tsx) that need a stronger color than the subtle `header` tint. */
export const CATEGORY_STYLES: Record<NodeCategory, { header: string; border: string; dot: string }> = {
  process: { header: 'bg-indigo-500/15', border: 'border-l-indigo-500', dot: 'bg-indigo-500' },
  content: { header: 'bg-emerald-500/15', border: 'border-l-emerald-500', dot: 'bg-emerald-500' },
  style: { header: 'bg-amber-500/15', border: 'border-l-amber-500', dot: 'bg-amber-500' },
  data: { header: 'bg-sky-500/15', border: 'border-l-sky-500', dot: 'bg-sky-500' },
  utils: { header: 'bg-slate-500/15', border: 'border-l-slate-500', dot: 'bg-slate-500' }
}

export const PROCESS_TYPES = new Set(['start', 'task', 'wait', 'condition', 'end'])

export const SOCKET_DOT: Record<SocketKind, string> = {
  content: '!bg-emerald-500',
  style: '!bg-amber-500',
  data: '!bg-sky-500',
  // Matches CATEGORY_DOT.process below — Condition's Then/Else rows read as
  // sequence-flow, same color as the plain generic "output" every other
  // process node uses, not as a data/content socket.
  process: '!bg-indigo-500'
}

/**
 * Generic single-output Handle color, keyed by NodeCategory — same palette
 * as SOCKET_DOT/CATEGORY_STYLES.dot, just including 'process' (never an
 * InputSocket.kind, since nothing ever accepts a process node as a
 * parameter — only as the next sequence-flow step). Used by BaseNode's plain
 * "output" handle (every node type without its own NODE_OUTPUTS entry) so an
 * Event/Sound/Timer/Position/Animation/... node's output dot matches the
 * wire color it produces (see displayEdges in SceneBuilderPage.tsx) instead
 * of a flat primary color that told you nothing about what kind of thing it
 * outputs.
 */
export const CATEGORY_DOT: Record<NodeCategory, string> = {
  process: '!bg-indigo-500',
  content: '!bg-emerald-500',
  style: '!bg-amber-500',
  data: '!bg-sky-500',
  utils: '!bg-slate-500'
}
