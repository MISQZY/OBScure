import { ALERT_TYPES_BY_PLATFORM } from '@shared/types'
/**
 * Everything flows left-to-right toward the single Scene node (the output —
 * see SceneNode): Text/Image feed into an optional Box, Box/Text/Image feed
 * into Scene, and "modifier" nodes (Position, Size, Transform, Animation,
 * Event, Sound, Timer, Hide, Display) have an output only, wired INTO
 * the node they affect. A node's own input sockets are therefore "what
 * modifies or contains me" — grouped by ROLE (Blender-style modifier stack —
 * see InputSocket/NODE_SOCKETS below), not a single shared dot: Transform
 * (Position/Size/Transform) and Style (Opacity/Shadow/Animation/Hide) each
 * take any number of wires, any mix of the types they accept, instead of one
 * dedicated socket per individual node type. Its output is "what I
 * contribute to". This is also what ScenePreview (SceneBuilderPage.tsx) and
 * overlays/custom.html walk to render the scene — both resolve wiring by the
 * connected node's `type`, never by which specific socket it's plugged into,
 * so which socket a wire lands on is purely for the graph to read clearly,
 * not something the interpreters care about. Where two wires land in the
 * same group and would set the same field (e.g. two Position nodes both
 * feeding one Transform group), whichever was wired more recently wins,
 * unless reordered via the numbered priority badge (see usePriorityInfo/
 * cyclePriority) — same as a later modifier overriding an earlier one in a
 * Blender modifier stack.
 *
 * Background FX is the one exception with BOTH: an output into Scene (to
 * activate it) and an input a Text node can feed (to caption
 * paratrooper/airdrop) — see BackgroundAnimationNode's own doc comment.
 *
 * Start/Task/Wait/End (the "Process" group) form a SECOND, separate kind of
 * edge in the same graph: sequence flow ("then"), not the data/composition
 * flow above ("feeds into"/"modifies"). Start → Task → Wait → ... → End
 * chains describe WHEN things happen — Wait accumulates elapsed time, each
 * Task shows/hides/updates ONE Text/Image/Box (wired into the Task's
 * `target` socket, same convention Box already uses for its own children)
 * with whatever Animation/Position/Size/Transform modifiers are wired into
 * that Task's OWN dedicated sockets for those. The structural graph above
 * still decides WHAT exists and how it's laid out/nested (a Task's target
 * must still reach Scene to render at all) — Start/Task/Wait/End only layer
 * timing on top. A Scene with a Start node reachable to an End ignores the
 * older Event+Timer→Scene single show/hide model entirely — see
 * buildProcessSchedule in SceneBuilderPage.tsx and overlays/custom.html.
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
  { id: 'style', label: 'Style', accepts: ['opacity', 'shadow', 'animation', 'hide'], kind: 'style', multi: true }
]

// Lets an Audio Player's Content output (see AUDIO_PLAYER_OUTPUTS below) be
// wired straight into a specific Text node instead of only reaching it
// indirectly via {title}/{artist} placeholders in its Content field. Unlike
// a plain modifier socket, wiring in doesn't replace Content — it just
// supplies the values Content's OWN {artist}/{title} placeholders resolve
// to for this node (see buildText's own doc comment in overlays/
// custom.html), so the field you actually edit is still Content's textarea.
// `multi: true` for future producers beyond Audio Player's own single wire —
// one Content wire already carries both artist and title bundled together.
// kind 'content' (not 'data'), despite only ever accepting Audio Player
// today — this socket IS content (a value feeding Content's own template),
// same family as Box's 'children'/Scene's own 'content' socket, so its dot
// reads green like theirs instead of the data-source violet/sky-blue tint.
export const TEXT_SOCKETS: InputSocket[] = [{ id: 'content', label: 'Content', accepts: ['audioPlayer'], kind: 'content', multi: true }, ...MODIFIER_SOCKETS]
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
  { id: 'children', label: 'Children', accepts: ['text', 'image', 'video', 'box', 'group'], kind: 'content', multi: true },
  ...MODIFIER_SOCKETS,
  { id: 'ordering', label: 'Layout', accepts: ['ordering'], kind: 'style' }
]

export const SCENE_SOCKETS: InputSocket[] = [
  { id: 'content', label: 'Content', accepts: ['box', 'group', 'text', 'image', 'video'], kind: 'content', multi: true },
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
  // a socket isn't `multi`.
  { id: 'event', label: 'Event', accepts: ['event', 'audioPlayer'], kind: 'data' },
  { id: 'timer', label: 'Timer', accepts: ['timer'], kind: 'data' }
]

export const BACKGROUND_FX_SOCKETS: InputSocket[] = [{ id: 'caption', label: 'Caption', accepts: ['text'], kind: 'content' }]

export const START_SOCKETS: InputSocket[] = [
  // Accepts 'audioPlayer' too, via its own Event output (see
  // AUDIO_PLAYER_OUTPUTS below) — an alternative to an Event node for
  // arming a process: fires on a track change instead of matching a real
  // alert's type. See processTrigger's audioArmed in overlays/custom.html.
  { id: 'event', label: 'Event', accepts: ['event', 'audioPlayer'], kind: 'data' },
  { id: 'sound', label: 'Sound', accepts: ['sound'], kind: 'data' },
  { id: 'backgroundFx', label: 'Background FX', accepts: ['backgroundAnimation'], kind: 'data' }
]

export const TASK_SOCKETS: InputSocket[] = [
  { id: 'target', label: 'Target', accepts: ['text', 'image', 'box', 'group', 'video'], kind: 'content' },
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
  task: TASK_SOCKETS
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
 * InputSocket.accepts is on the input side. `help`: an optional per-output
 * tooltip (a "?" popover on the row itself, same mechanism as BaseNode's own
 * header `help` — see OutputRow) for spelling out exactly what THIS output
 * does and where to wire it, so the node's header help can stay a short
 * one-liner about the node as a whole instead of cramming every output's
 * behavior into one popover.
 */
export type OutputSocket = {
  id: string
  label: string
  kind: 'content' | 'style' | 'data'
  feeds: string[]
  help?: string
}

export const STRUCTURAL_OUTPUT: OutputSocket = {
  id: 'structural',
  label: 'Structural',
  kind: 'content',
  feeds: ['children', 'content'],
  help: "Makes this part of what's actually rendered — wire it into a Box or Group's Children socket to nest it, or straight into Scene's own Content socket to place it at the top level."
}
export const TARGET_OUTPUT: OutputSocket = {
  id: 'target',
  label: 'As Target',
  kind: 'content',
  feeds: ['target'],
  help: "Wire into a Task's own Target socket to mark this as the thing that step shows, hides, or updates. Doesn't replace Structural — a component still needs that wire too, or it has nothing to render at all."
}
export const CAPTION_OUTPUT: OutputSocket = {
  id: 'caption',
  label: 'As Caption',
  kind: 'content',
  feeds: ['caption'],
  help: "Wire into a Background FX node's own Caption socket to caption a paratrooper/airdrop drop with this text."
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
    help: "Bundles Artist, Title, and Cover in one wire. Wire into a Text node's own Content socket to fill its {artist}/{title} placeholders, or into an Image node's own Content socket to show the live album art instead — which fields apply depends on where it lands, not on anything you choose here."
  },
  // kind 'data': a trigger/state signal, not a value feeding a template.
  {
    id: 'event',
    label: 'Event',
    kind: 'data',
    feeds: ['event'],
    help: "The track-change/now-playing signal. Wire into a Start node's own Event socket to arm a process on track change, and/or into Scene's own Event socket to show/hide the whole scene by isPlaying — both at once is fine, they're independent sockets on independent nodes."
  }
]

/** Every node type's OUTPUT sockets, keyed by node `type` — analogous to NODE_SOCKETS. Node types absent here (the large majority) render the single generic "output" handle unchanged. */
export const NODE_OUTPUTS: Record<string, OutputSocket[]> = {
  text: TEXT_OUTPUTS,
  image: IMAGE_OUTPUTS,
  video: VIDEO_OUTPUTS,
  box: BOX_OUTPUTS,
  group: BOX_OUTPUTS,
  audioPlayer: AUDIO_PLAYER_OUTPUTS
}

/**
 * What kind of thing a node is, purely for visual grouping (header tint +
 * left accent stripe — see CATEGORY_STYLES/BaseNode) so the graph reads at
 * a glance instead of every node looking the same:
 *  - process: Start/Task/Wait/End — the sequence-flow chain.
 *  - content: Scene/Text/Image/Box — what exists and how it's nested.
 *  - style: Position/Size/Transform/Animation/Hide/Display/Ordering —
 *    per-component modifiers, wired into a SPECIFIC Text/Image/Box/Task.
 *  - data: Event/Random/Roulette/Audio Player/Sound/Timer/Range/Roulette
 *    Settings/Background FX — scene/process-level accessories (event feeds,
 *    one-shot behavior, ambient config) that activate alongside a trigger
 *    rather than reshaping a piece of content — see BackgroundAnimationNode's
 *    own doc comment for why it lives here despite the "FX" name.
 */
export type NodeCategory = 'process' | 'content' | 'style' | 'data'

/** `dot`: solid bg-*-500, for small indicators (SocketRow's dots, the Add Node palette's group/button accents in SceneBuilderPage.tsx) that need a stronger color than the subtle `header` tint. */
export const CATEGORY_STYLES: Record<NodeCategory, { header: string; border: string; dot: string }> = {
  process: { header: 'bg-indigo-500/15', border: 'border-l-indigo-500', dot: 'bg-indigo-500' },
  content: { header: 'bg-emerald-500/15', border: 'border-l-emerald-500', dot: 'bg-emerald-500' },
  style: { header: 'bg-amber-500/15', border: 'border-l-amber-500', dot: 'bg-amber-500' },
  data: { header: 'bg-sky-500/15', border: 'border-l-sky-500', dot: 'bg-sky-500' }
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
  event: 'data',
  randomSource: 'data',
  rouletteSource: 'data',
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
  image: { borderRadius: 8, borderEnabled: false, borderWidth: 2, borderColor: '#ffffff' },
  video: { muted: true, loop: true, borderRadius: 8, borderEnabled: false, borderWidth: 2, borderColor: '#ffffff' },
  backgroundAnimation: { type: 'none', color: '#18181b', speed: 1, repeat: false },
  sound: { soundId: 'none', volume: 1 },
  event: { kind: 'alert', platform: 'twitch', alertType: ALERT_TYPES_BY_PLATFORM.twitch[0] },
  ordering: { layout: 'vertical', direction: 'direct', gap: 8 },
  hide: { hidden: true },
  task: { action: 'show' },
  wait: { delay: 1000 }
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
  data: '!bg-sky-500'
}