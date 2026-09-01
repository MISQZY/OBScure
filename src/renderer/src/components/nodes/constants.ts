import { ALERT_TYPES_BY_PLATFORM } from '@shared/types'
/**
 * The node graph has two independent kinds of edges (data/composition vs.
 * sequence-flow) and groups input sockets by role, Blender-modifier-stack
 * style — see docs/events-system.md's "Node Graph Data Model" section for
 * the full picture before changing InputSocket/NODE_SOCKETS/NODE_OUTPUTS
 * below.
 */

/**
 * One labeled input socket on a node — Blender-style: a modifier that
 * overrides a specific ROLE (Transform, Style, ...) plugs into the socket
 * for that role, instead of every wire piling onto one shared dot. `accepts`
 * is enforced by isValidConnection in SceneBuilderPage.tsx (shared from
 * NODE_SOCKETS below so BaseNode's rendering and connection validation never
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
export type InputSocket = {
  id: string
  label: string
  accepts: string[]
  /** Dot color only — reuses the CATEGORY_STYLES palette so a socket's color hints at what kind of node it accepts. */
  kind: 'content' | 'style' | 'data'
  multi?: boolean
}

/**
 * The two grouped "modifier" roles shared by Text/Image/Video/Box (and,
 * minus Hide, by Task — see TASK_SOCKETS): Transform (Position + Size +
 * Transform/scale+rotate — anything that changes WHERE or HOW BIG something
 * is) and Style (Opacity + Shadow + Animation + Hide — anything that changes
 * how it LOOKS or whether it shows at all). Each is `multi: true`: wire in a
 * Position AND a Size AND a Transform node together to get all three at
 * once, same as before these were separate sockets — see modifierStyle's own
 * doc comment in SceneBuilderPage.tsx for how the values combine (and how a
 * second wire of the SAME type in one group is resolved).
 */
export const MODIFIER_SOCKETS: InputSocket[] = [
  { id: 'transform', label: 'Transform', accepts: ['position', 'size', 'transform'], kind: 'style', multi: true },
  { id: 'style', label: 'Style', accepts: ['opacity', 'shadow', 'animation', 'hide', 'overflow'], kind: 'style', multi: true }
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
  { id: 'content', label: 'Content', accepts: ['audioPlayer', 'rouletteEntrants', 'randomSource'], kind: 'content', multi: true },
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
  { id: 'source', label: 'Source', accepts: ['rouletteSource'], kind: 'content' },
  { id: 'visible', label: 'Visibility', accepts: ['rouletteSource'], kind: 'data' },
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
export const ROULETTE_ENTRANTS_SOCKETS: InputSocket[] = [{ id: 'source', label: 'Source', accepts: ['rouletteSource'], kind: 'content' }]
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
  { id: 'source', label: 'Source', accepts: ['randomSource'], kind: 'content' },
  { id: 'visible', label: 'Visibility', accepts: ['randomSource'], kind: 'data' },
  ...MODIFIER_SOCKETS,
  // Same Ordering socket Box/Scene have (see BOX_SOCKETS above) — controls
  // how the rolled numbers lay out relative to EACH OTHER (row/column, gap)
  // once Count is above 1. Not needed at all for a single number; matters
  // once there's more than one to arrange, same as it would for any other
  // multi-item layout — see RandomWidgetView in overlays/views/index.tsx /
  // buildRandomWidget in overlays/custom.html.
  { id: 'ordering', label: 'Layout', accepts: ['ordering'], kind: 'style' }
]
// Same "Content" concept as TEXT_SOCKETS' own socket above, but for Image:
// wiring Audio Player's Content output in shows the live now-playing album
// art unconditionally (see buildImage's own doc comment), taking priority
// over a set URL/uploaded image — ImageNode's own URL field goes read-only
// while this is connected, since the connection already decides what's
// shown. Own id (not 'content') purely so a Text's Content socket and this
// one read as visibly different rows despite the identical label — the SAME
// Content output can reach either (see AUDIO_PLAYER_OUTPUTS' own `feeds`).
export const IMAGE_SOCKETS: InputSocket[] = [{ id: 'imageContent', label: 'Content', accepts: ['audioPlayer'], kind: 'content' }, ...MODIFIER_SOCKETS]
export const VIDEO_SOCKETS: InputSocket[] = MODIFIER_SOCKETS

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
  { id: 'children', label: 'Children', accepts: ['text', 'image', 'video', 'box', 'group', 'rouletteWidget', 'randomWidget'], kind: 'content', multi: true },
  ...MODIFIER_SOCKETS,
  { id: 'ordering', label: 'Layout', accepts: ['ordering'], kind: 'style' }
]

export const SCENE_SOCKETS: InputSocket[] = [
  { id: 'content', label: 'Content', accepts: ['box', 'group', 'text', 'image', 'video', 'rouletteWidget', 'randomWidget'], kind: 'content', multi: true },
  // kind 'data', not 'style' — Background FX is category 'data' (see its own
  // doc comment below), so this socket's dot/wire should match ITS color,
  // not the per-component style modifiers (Position/Animation/...) it has
  // nothing to do with.
  { id: 'backgroundFx', label: 'Background FX', accepts: ['backgroundAnimation'], kind: 'data' },
  { id: 'sound', label: 'Sound', accepts: ['sound'], kind: 'data' },
  { id: 'ordering', label: 'Layout', accepts: ['ordering'], kind: 'style' },
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
  { id: 'event', label: 'Event', accepts: ['event', 'audioPlayer'], kind: 'data' },
  { id: 'timer', label: 'Timer', accepts: ['timer'], kind: 'data' }
]

export const BACKGROUND_FX_SOCKETS: InputSocket[] = [{ id: 'caption', label: 'Caption', accepts: ['text'], kind: 'content' }]

export const START_SOCKETS: InputSocket[] = [
  // Accepts 'audioPlayer' too, via its own Event output (see
  // AUDIO_PLAYER_OUTPUTS below) — an alternative to an Event node for
  // arming a process: fires on a track change instead of matching a real
  // alert's type. See processTrigger's audioArmed in overlays/custom.html.
  { id: 'event', label: 'Event', accepts: ['event', 'audioPlayer', 'rouletteSource', 'randomSource'], kind: 'data' },
  { id: 'sound', label: 'Sound', accepts: ['sound'], kind: 'data' },
  { id: 'backgroundFx', label: 'Background FX', accepts: ['backgroundAnimation'], kind: 'data' }
]

export const TASK_SOCKETS: InputSocket[] = [
  { id: 'target', label: 'Target', accepts: ['text', 'image', 'box', 'group', 'video', 'rouletteWidget'], kind: 'content' },
  // Same Transform/Style grouping as MODIFIER_SOCKETS, minus Hide (a Task's
  // visibility is already its own show/hide Action field, not a separate
  // modifier) — these are what THIS step changes, layered on top of the
  // target's own base Transform/Style at the moment the step fires. See
  // computeTaskState's own doc comment in SceneBuilderPage.tsx.
  { id: 'transform', label: 'Transform', accepts: ['position', 'size', 'transform'], kind: 'style', multi: true },
  { id: 'style', label: 'Style', accepts: ['opacity', 'shadow', 'animation'], kind: 'style', multi: true },
  // A Task's own one-shot cue — plays once when THIS step fires (e.g. a
  // cash-register sound only when the donation amount appears), distinct
  // from Start's Sound (fires once at the process's very beginning). See
  // buildProcessSchedule/showProcessContent's own doc comments for how a
  // step's sound gets collected and played.
  { id: 'sound', label: 'Sound', accepts: ['sound'], kind: 'data' }
]

/** Every node type's input sockets, keyed by node `type` — the single source of truth shared between BaseNode's rendering and isValidConnection in SceneBuilderPage.tsx. Node types absent here have no sockets of their own (pure sources — Position/Animation/Event/... — or Wait/End, which only take the process `sequenceIn` row). */
export const NODE_SOCKETS: Record<string, InputSocket[]> = {
  text: TEXT_SOCKETS,
  image: IMAGE_SOCKETS,
  video: VIDEO_SOCKETS,
  box: BOX_SOCKETS,
  group: BOX_SOCKETS,
  scene: SCENE_SOCKETS,
  backgroundAnimation: BACKGROUND_FX_SOCKETS,
  start: START_SOCKETS,
  task: TASK_SOCKETS,
  rouletteWidget: ROULETTE_WIDGET_SOCKETS,
  rouletteEntrants: ROULETTE_ENTRANTS_SOCKETS,
  randomWidget: RANDOM_WIDGET_SOCKETS
}

/**
 * One labeled OUTPUT socket — the output-side mirror of InputSocket, for the
 * few node types whose single output otherwise fans out to genuinely
 * different roles (a Box feeding both Scene's `content`, structurally, and
 * a Task's `target`, as what that step controls — previously both wires
 * left the same unlabeled dot). Most node types have exactly one role for
 * their output (a Position modifier is always "a position", regardless of
 * which target it lands on) and keep the plain single "output" handle —
 * see BaseNode's `outputSockets` prop, only set for the types below.
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
export type OutputSocket = {
  id: string
  label: string
  kind: 'content' | 'style' | 'data'
  feeds: string[]
  helpKey?: string
}

export const STRUCTURAL_OUTPUT: OutputSocket = {
  id: 'structural',
  label: 'Structural',
  kind: 'content',
  feeds: ['children', 'content'],
  helpKey: 'structural'
}
export const TARGET_OUTPUT: OutputSocket = {
  id: 'target',
  label: 'As Target',
  kind: 'content',
  feeds: ['target'],
  helpKey: 'target'
}
export const CAPTION_OUTPUT: OutputSocket = {
  id: 'caption',
  label: 'As Caption',
  kind: 'content',
  feeds: ['caption'],
  helpKey: 'caption'
}

export const TEXT_OUTPUTS: OutputSocket[] = [STRUCTURAL_OUTPUT, TARGET_OUTPUT, CAPTION_OUTPUT]
export const IMAGE_OUTPUTS: OutputSocket[] = [STRUCTURAL_OUTPUT, TARGET_OUTPUT]
export const VIDEO_OUTPUTS: OutputSocket[] = [STRUCTURAL_OUTPUT, TARGET_OUTPUT]
export const BOX_OUTPUTS: OutputSocket[] = [STRUCTURAL_OUTPUT, TARGET_OUTPUT]

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
  {
    id: 'content',
    label: 'Content',
    kind: 'content',
    feeds: ['content', 'imageContent'],
    helpKey: 'audioContent'
  },
  // kind 'data': a trigger/state signal, not a value feeding a template.
  {
    id: 'event',
    label: 'Event',
    kind: 'data',
    feeds: ['event'],
    helpKey: 'audioEvent'
  }
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
  {
    id: 'content',
    label: 'Content',
    kind: 'content',
    feeds: ['source'],
    helpKey: 'rouletteContent'
  },
  {
    id: 'event',
    label: 'Event',
    kind: 'data',
    feeds: ['event', 'visible'],
    helpKey: 'rouletteEvent'
  }
]

/**
 * A Roulette Widget's own single Structural/Target role — plain reuse of
 * STRUCTURAL_OUTPUT/TARGET_OUTPUT, same shape as TEXT_OUTPUTS/IMAGE_OUTPUTS/
 * VIDEO_OUTPUTS/BOX_OUTPUTS above. Nothing Roulette-specific about the
 * OUTPUT side — what's special is entirely on the INPUT side (its own
 * `source`/`visible` sockets, see NODE_SOCKETS.rouletteWidget above) and in
 * how the node itself comes to exist (auto-paired, never placed by hand from
 * the palette — see addNode's own doc comment in hooks/useSceneGraph.ts).
 */
export const ROULETTE_WIDGET_OUTPUTS: OutputSocket[] = [STRUCTURAL_OUTPUT, TARGET_OUTPUT]

/**
 * A Roulette Entrants list's own single output — unlike the Widget's above,
 * this ISN'T Structural/Target (it's not independently placeable in Scene/a
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
export const ROULETTE_ENTRANTS_OUTPUTS: OutputSocket[] = [
  {
    id: 'content',
    label: 'Content',
    kind: 'content',
    feeds: ['content'],
    helpKey: 'rouletteEntrantsContent'
  }
]

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
  {
    id: 'content',
    label: 'Content',
    kind: 'content',
    feeds: ['source', 'content'],
    helpKey: 'randomContent'
  },
  {
    id: 'event',
    label: 'Event',
    kind: 'data',
    feeds: ['event', 'visible'],
    helpKey: 'randomEvent'
  }
]

/** A Random Widget's own single Structural/Target role — same reuse of STRUCTURAL_OUTPUT/TARGET_OUTPUT as ROULETTE_WIDGET_OUTPUTS above; nothing Random-specific about the output side. */
export const RANDOM_WIDGET_OUTPUTS: OutputSocket[] = [STRUCTURAL_OUTPUT, TARGET_OUTPUT]

/** Every node type's OUTPUT sockets, keyed by node `type` — analogous to NODE_SOCKETS. Node types absent here (the large majority) render the single generic "output" handle unchanged. */
export const NODE_OUTPUTS: Record<string, OutputSocket[]> = {
  text: TEXT_OUTPUTS,
  image: IMAGE_OUTPUTS,
  video: VIDEO_OUTPUTS,
  box: BOX_OUTPUTS,
  group: BOX_OUTPUTS,
  audioPlayer: AUDIO_PLAYER_OUTPUTS,
  rouletteSource: ROULETTE_OUTPUTS,
  rouletteWidget: ROULETTE_WIDGET_OUTPUTS,
  rouletteEntrants: ROULETTE_ENTRANTS_OUTPUTS,
  randomSource: RANDOM_OUTPUTS,
  randomWidget: RANDOM_WIDGET_OUTPUTS
}

/**
 * What kind of thing a node is, purely for visual grouping (header tint +
 * left accent stripe — see CATEGORY_STYLES/BaseNode) so the graph reads at
 * a glance instead of every node looking the same:
 *  - process: Start/Task/Wait/End — the sequence-flow chain.
 *  - content: Scene/Text/Image/Box — what exists and how it's nested.
 *  - style: Position/Size/Transform/Animation/Hide/Overflow/Display/Ordering —
 *    per-component modifiers, wired into a SPECIFIC Text/Image/Box/Task.
 *  - data: Event/Random/Roulette/Audio Player/Sound/Timer/Range/Roulette
 *    Settings/Background FX — scene/process-level accessories (event feeds,
 *    one-shot behavior, ambient config) that activate alongside a trigger
 *    rather than reshaping a piece of content — see BackgroundAnimationNode's
 *    own doc comment for why it lives here despite the "FX" name.
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

export const PROCESS_TYPES = new Set(['start', 'task', 'wait', 'end'])

/**
 * Every node type's category, keyed by node `type` — the same source of
 * truth each node component's own `category` prop uses, exported so the
 * Add Node palette (SceneBuilderPage.tsx) can tint its group headers and
 * buttons to match the exact colors a node gets once it's actually placed
 * on the canvas, instead of the palette looking uniform while the graph
 * itself is color-coded.
 */
export const NODE_CATEGORY: Record<string, NodeCategory> = {
  scene: 'content',
  text: 'content',
  image: 'content',
  video: 'content',
  box: 'content',
  group: 'content',
  frame: 'utils',
  start: 'process',
  task: 'process',
  wait: 'process',
  end: 'process',
  position: 'style',
  size: 'style',
  transform: 'style',
  opacity: 'style',
  shadow: 'style',
  animation: 'style',
  ordering: 'style',
  hide: 'style',
  overflow: 'style',
  event: 'data',
  randomSource: 'data',
  randomWidget: 'content',
  rouletteSource: 'data',
  rouletteWidget: 'content',
  rouletteEntrants: 'data',
  audioPlayer: 'data',
  sound: 'data',
  timer: 'data',
  backgroundAnimation: 'data'
}

/**
 * Every node type's default `data`, keyed by node `type` — applied by addNode
 * (SceneBuilderPage.tsx) the moment a node is placed, so a fresh node's data
 * already holds concrete values instead of an empty object that only *looks*
 * populated because each field below falls back to the same default at
 * render time. That per-field fallback stays in place regardless (it's what
 * keeps a scene saved before some field existed — e.g. Text's `bold` —
 * rendering unchanged), this just makes a brand-new node's data match what
 * it visibly shows from the start rather than lagging until the first edit.
 * Node types absent here have no fields of their own (Scene, Start, End,
 * Size, ...) — Size's width/height default to `null` ("auto") anyway, the
 * same as never having been set.
 */
export const NODE_DEFAULTS: Record<string, Record<string, unknown>> = {
  transform: { scaleX: 1, scaleY: 1, rotation: 0 },
  position: { mode: 'absolute', anchor: 'top-left', x: 0, y: 0 },
  opacity: { value: 100 },
  shadow: { color: '#000000', opacity: 60, blur: 6, offsetX: 0, offsetY: 2 },
  text: { text: '', color: '#ffffff', fontSize: 32, letterSpacing: 0, align: 'left', verticalAlign: 'top', bold: true, italic: false },
  timer: { delay: 1000 },
  animation: { type: 'fade', duration: 500, subType: 'auto' },
  box: { background: '#18181b', paddingX: 16, paddingY: 12, shape: 'rectangle', borderRadius: 10, borderEnabled: false, borderWidth: 2, borderColor: '#ffffff' },
  frame: { collapsed: false, label: 'Layout Frame' },
  image: { borderRadius: 8, borderEnabled: false, borderWidth: 2, borderColor: '#ffffff' },
  video: { muted: true, loop: true, borderRadius: 8, borderEnabled: false, borderWidth: 2, borderColor: '#ffffff' },
  backgroundAnimation: { type: 'none', color: '#18181b', speed: 1, repeat: false },
  sound: { soundId: 'none', volume: 1 },
  event: { kind: 'alert', platform: 'twitch', alertType: ALERT_TYPES_BY_PLATFORM.twitch[0] },
  ordering: { layout: 'vertical', direction: 'direct', gap: 8 },
  hide: { hidden: true },
  overflow: { overflowX: 'hidden', overflowY: 'hidden', autoScroll: false, scrollDirection: 'up', scrollSpeed: 40 },
  task: { action: 'show' },
  wait: { delay: 1000 },
  // rowTemplate tokens: {name}/{chance}/{weight} — see rouletteEntrantRows'
  // own doc comment in overlays/sceneUtils.tsx. layout 'list' = one entrant
  // per line, 'inline' joins them with `separator` instead. No color/
  // fontSize/etc. here — those are whichever Text node this feeds into's
  // own fields (see ROULETTE_ENTRANTS_OUTPUTS' own doc comment above).
  rouletteEntrants: { layout: 'list', rowTemplate: '{name}', sortByChance: false, separator: ', ' }
}

export const SOCKET_DOT: Record<InputSocket['kind'], string> = {
  content: '!bg-emerald-500',
  style: '!bg-amber-500',
  data: '!bg-sky-500'
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