function nodeMap(nodes) {
  const map = {}
  for (const n of nodes) map[n.id] = n
  return map
}

// Nodes wired directly INTO nodeId — mirrors ScenePreview in
// SceneBuilderPage.tsx, sort included: lower data.priority renders
// first (see usePriorityInfo's cyclePriority in components/nodes/
// index.tsx, the little numbered badge on a node with siblings
// feeding the same target) — this MUST match SceneBuilderPage.tsx's
// own incoming() exactly, or a scene would order its content
// differently in the editor preview than in the real OBS overlay.
function incoming(nodeId, edges, map) {
  return edges
    .filter((e) => e.target === nodeId)
    .map((e) => map[e.source])
    .filter(Boolean)
    .sort((a, b) => ((a.data && a.data.priority) || 0) - ((b.data && b.data.priority) || 0))
}

// The last node of `type` in `mods` — mirrors lastOfType in
// SceneBuilderPage.tsx, used everywhere a grouped Transform/Style
// socket (see MODIFIER_SOCKETS/TASK_SOCKETS in components/nodes/
// index.tsx) is resolved instead of Array.find, since that socket now
// accepts more than one wire of the same type. `mods` must already be
// ordered so the intended winner comes LAST — see that function's own
// doc comment for why incoming()'s and computeTaskState's own orderings
// both already satisfy this.
function lastOfType(mods, type) {
  for (let i = mods.length - 1; i >= 0; i--) {
    if (mods[i].type === type) return mods[i]
  }
  return undefined
}

// Fills {user}/{amount}/{message}/{source}-style placeholders from an
// event's vars (or {artist}/{title} from audioContentValues — see
// buildText) — mirrors interpolate() in SceneBuilderPage.tsx. `vars`
// is null/undefined outside an event-triggered show (a plain scene),
// in which case every placeholder is left as literal text. A key NOT
// present in `vars` (as opposed to present but empty) is left literal
// too, same reasoning as the `!vars` case — only actually-AVAILABLE
// placeholders get filled in, so e.g. "{user}: {title}" in a scene
// with Event vars but no {title} source keeps "{title}" literal
// instead of collapsing to a bare "Viewer: ".
function interpolate(template, vars) {
  if (!vars) return template
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in vars)) return match
    const value = vars[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

// AlertPayload only SOMETIMES declares amount/message (see
// mapNotificationToAlert in twitch.ts — a follow event has neither key
// at all, not even set to undefined) — normalized here so every known
// Event placeholder key is always present, even if its value ends up
// undefined. Matches interpolate()'s own "key in vars" availability
// check: without this, a follow alert's genuinely-missing `amount` key
// would make an unrelated Text's "{amount}" render as literal text
// instead of blank, purely because THIS alert type happens not to
// carry one — a difference that has nothing to do with whether Event
// vars are available at all (they are) and shouldn't leak into how
// the placeholder renders.
function normalizeAlertVars(payload) {
  return { type: payload.type, user: payload.user, amount: payload.amount, message: payload.message, source: payload.source }
}

// --- Process (Start -> Task -> Wait -> ... -> End) --------------------
// A richer alternative to the plain DataSource(alert)+Timer->Scene
// model above: a Scene with a Start node (see nodes/index.tsx
// StartNode/TaskNode/WaitNode/EndNode) sequences individual Task
// actions (show/hide/update one component, with Animation/Position/
// Size/Transform modifiers wired into the Task itself) over time,
// walked via sequence-flow edges — separate from and layered on top
// of the SAME structural graph (Text/Image/Box -> Scene) that already
// decides what exists and how it's nested/laid out. A Scene with no
// Start node ignores all of this and renders exactly as it always
// has (isEventTrigger/renderStatic above). Mirrors
// buildProcessSchedule/processTrigger/computeTaskState in
// SceneBuilderPage.tsx exactly.

const PROCESS_TYPES = new Set(['start', 'task', 'wait', 'condition', 'end'])

// Safety cap on how many nodes buildProcessSchedule will ever walk in
// one pass — Condition makes it possible to wire Else (or Then) back
// to an earlier step (an intentional "retry" loop); without a cap, one
// that never reaches End would hang the walk. Mirrors MAX_PROCESS_STEPS
// in pages/overlays/sceneUtils/processSchedule.ts.
const MAX_PROCESS_STEPS = 500

/**
 * Resolves one Condition node's field/operator/value against `vars` —
 * the SAME {user}/{amount}/{message}/{source} bag interpolate()
 * already fills a Text/Image placeholder from (see
 * normalizeAlertVars). `vars` null/undefined (no live alert context —
 * the process was armed by Audio Player/Roulette/Random instead of a
 * real Event) or the field genuinely absent from this particular
 * payload (e.g. `amount` on a follow) always evaluates false — routes
 * down Else rather than throwing or silently "matching" on absent
 * data. String comparisons are case-insensitive. Mirrors
 * evaluateCondition in pages/overlays/sceneUtils/graph.ts.
 */
function evaluateCondition(data, vars) {
  const field = data.field || 'amount'
  const operator = data.operator || 'eq'
  const raw = vars ? vars[field] : undefined
  if (raw === undefined || raw === null) return false
  const compare = typeof data.value === 'string' ? data.value : ''
  if (field === 'amount') {
    const a = Number(raw)
    const b = Number(compare)
    if (Number.isNaN(a) || Number.isNaN(b)) return false
    switch (operator) {
      case 'eq':
        return a === b
      case 'neq':
        return a !== b
      case 'gt':
        return a > b
      case 'gte':
        return a >= b
      case 'lt':
        return a < b
      case 'lte':
        return a <= b
      default:
        return false
    }
  }
  const a = String(raw).toLowerCase()
  const b = compare.toLowerCase()
  switch (operator) {
    case 'eq':
      return a === b
    case 'neq':
      return a !== b
    case 'contains':
      return a.includes(b)
    default:
      return false
  }
}

function nextProcessNode(nodeId, edges, map, vars) {
  const node = map[nodeId]
  const branch = node && node.type === 'condition' ? (evaluateCondition(node.data, vars) ? 'then' : 'else') : null
  const edge = edges.find(
    (e) => e.source === nodeId && (branch ? e.sourceHandle === branch : true) && map[e.target] && PROCESS_TYPES.has(map[e.target].type)
  )
  return edge ? map[edge.target] : null
}

/**
 * Walks the Start -> Task -> Wait -> Condition -> ... -> End
 * sequence-flow chain into a flat, time-resolved schedule: one entry
 * per Task, `atMs` accumulated from every Wait node's delay passed so
 * far. A Task with no component wired into it (via a plain data edge,
 * same as a Box's own children) is skipped — nothing to act on. A
 * Condition picks Then or Else by evaluating its field/operator/value
 * against `vars` (null outside a real alert-armed process, in which
 * case every Condition falls to Else).
 */
function buildProcessSchedule(nodes, edges, vars) {
  const map = nodeMap(nodes)
  const start = nodes.find((n) => n.type === 'start')
  if (!start) return null
  const schedule = []
  let atMs = 0
  let current = nextProcessNode(start.id, edges, map, vars)
  let steps = 0
  while (current && steps++ < MAX_PROCESS_STEPS) {
    if (current.type === 'wait') {
      atMs += current.data.delay || 1000
    } else if (current.type === 'task') {
      const incomingNodes = incoming(current.id, edges, map)
      const target = incomingNodes.find(
        (n) =>
          n.type === 'text' ||
          n.type === 'image' ||
          n.type === 'video' ||
          n.type === 'progress' ||
          n.type === 'box' ||
          n.type === 'group' ||
          n.type === 'rouletteWidget' ||
          n.type === 'randomWidget'
      )
      if (target) {
        schedule.push({
          atMs,
          targetId: target.id,
          action: current.data.action || 'show',
          // 'sound' rides along in mods same as animation/position/...
          // — computeTaskState ignores it (only .find()s the types it
          // knows), it's picked back out by atMs in showProcessContent
          // to fire once when this step's moment arrives.
          mods: incomingNodes.filter(
            (n) => n.type === 'animation' || n.type === 'position' || n.type === 'size' || n.type === 'transform' || n.type === 'opacity' || n.type === 'shadow' || n.type === 'sound'
          )
        })
      }
    } else if (current.type === 'end') {
      break
    }
    current = nextProcessNode(current.id, edges, map, vars)
  }
  return { schedule, totalMs: atMs }
}

// Same content types buildBox's own `children` filter (and Scene's own
// top-level `renderable` filter) accept — what a Random Pick node's
// variants can be drawn from. Kept as its own list (mirroring
// CONTENT_TYPES in pages/overlays/sceneUtils/graph.ts) rather than
// reusing one of the several near-identical inline filters already in
// this file, since none of THOSE are shared constants either.
const RANDOM_PICK_VARIANT_TYPES = new Set(['text', 'image', 'video', 'progress', 'box', 'group', 'randomPick', 'rouletteWidget', 'randomWidget'])

// Nesting can go as deep as the graph wants (see BOX_SOCKETS' own doc
// comment in components/nodes/index.tsx) — this cap is only a safety
// net against a cycle slipping past isValidConnection's own guard in
// SceneBuilderPage.tsx (imported/hand-edited JSON, say) turning into
// an infinite recursion that hangs the Browser Source; no legitimate
// scene should ever come close to it.
const MAX_BOX_DEPTH = 12

/**
 * Picks ONE of a Random Pick node's connected `children`-socket
 * options — uniform when `data.customChance` is off, weighted by
 * `data.weights[variantId]` otherwise (a missing/negative/non-numeric
 * entry defaults to 1, same convention as an unset Roulette entrant's
 * own weight). All-zero weights fall back to a uniform pick across
 * all of them rather than resolving to nothing. `null` only when
 * nothing is wired into `children` at all. Called fresh once per
 * "show" (never memoized) — mirrors pickRandomVariant in
 * pages/overlays/sceneUtils/graph.ts.
 */
function pickRandomVariant(node, edges, map) {
  const variants = incoming(node.id, edges, map).filter((n) => RANDOM_PICK_VARIANT_TYPES.has(n.type))
  if (variants.length === 0) return null
  const customChance = !!(node.data && node.data.customChance)
  const weights = customChance && node.data.weights ? node.data.weights : null
  const weightOf = (v) => {
    if (!weights) return 1
    const raw = weights[v.id]
    return typeof raw === 'number' && raw >= 0 ? raw : 1
  }
  const total = variants.reduce((sum, v) => sum + weightOf(v), 0)
  if (total <= 0) return variants[Math.floor(Math.random() * variants.length)]
  let roll = Math.random() * total
  for (const v of variants) {
    roll -= weightOf(v)
    if (roll < 0) return v
  }
  return variants[variants.length - 1]
}
