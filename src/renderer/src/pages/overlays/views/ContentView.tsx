import { Node, Edge } from "@xyflow/react";
import type { OverlayUrls } from "@shared/types";
import { useGlobalVariables } from "@/providers/GlobalVariablesProvider";
import { useTwitchStats } from "@/providers/TwitchStatsProvider";
import {
  incoming,
  audioContentValues,
  randomContentValues,
  clockFormatFor,
  variablePlaceholderValues,
  hasAudioCover,
  rouletteEntrantsTextValue,
  overflowAutoScroll,
  modifierStyle,
  animationAttrs,
  computeTaskState,
  NodeMap,
  ScheduledTask
} from "../sceneUtils";
import { BoxView } from "./BoxView";
import { TextView } from "./TextView";
import { ImageView } from "./ImageView";
import { VideoView } from "./VideoView";
import { ProgressView } from "./ProgressView";
import { RouletteWheelView } from "./RouletteWheelView";
import { RandomWidgetView } from "./RandomWidgetView";
import { RandomPickView } from "./RandomPickView";

/** A content node (Text/Image/Video/Roulette wheel/Random widget), or a nested Box (delegated to BoxView) — plus whatever's wired into ITS input (Position, Transform, Animation, ...). Roulette Entrants (see RouletteEntrantsNode.tsx) isn't among these — it has no rendering of its own, only a Content wire into a Text node's own socket (see rouletteEntrantsTextValue below); Random has no node of its own like it at all, its Content output wiring straight into a Text's Content socket instead (see randomContentValues below). */
export function ContentView({
  node,
  edges,
  map,
  playToken,
  played,
  hiding,
  vars,
  schedule,
  clockMs,
  urls,
  depth = 0,
  crossAxis
}: {
  node: Node
  edges: Edge[]
  map: NodeMap
  playToken: number
  played: boolean
  hiding: boolean
  vars: Record<string, unknown> | null
  /** A running Process's resolved Tasks, if any — see computeTaskState. Components with no Task targeting them fall through to the graph's own modifiers/wiring below, unaffected. */
  schedule: ScheduledTask[]
  clockMs: number
  urls: OverlayUrls | null
  /** Nesting depth so far (0 = directly on Scene) — see BoxView's own doc comment for why this is capped. */
  depth?: number
  /** The CROSS axis of whichever Box/Scene `node` is a direct child of — see TextView's own doc comment. Only consumed for a `text` node; a nested Box computes a FRESH one off its own Ordering for ITS OWN children. */
  crossAxis: 'horizontal' | 'vertical'
}) {
  const { variables: globalVariables } = useGlobalVariables()
  const twitchStats = useTwitchStats()
  // A nested Box or Group (see BOX_SOCKETS' own doc comment in
  // components/nodes/index.tsx) — BoxView resolves its OWN schedule/style/
  // vars, same as a top-level one, and handles both node types identically
  // except for Box's own decorative styling; ContentView/BoxView are
  // mutually recursive to whatever depth the graph nests.
  if (node.type === 'box' || node.type === 'group') {
    return (
      <BoxView node={node} edges={edges} map={map} playToken={playToken} played={played} hiding={hiding} vars={vars} schedule={schedule} clockMs={clockMs} urls={urls} depth={depth} />
    )
  }
  // Resolves to exactly ONE of its own wired options — see RandomPickView's
  // own doc comment. Bypasses the schedule/mods logic below entirely, same
  // as Box/Group above: a Random Pick node isn't itself Task-targetable
  // (see TASK_SOCKETS' own `accepts` list in components/nodes/constants.ts
  // — deliberately excludes it, keeping "which step controls this" to
  // whichever CHILD ends up picked instead of the router node itself).
  if (node.type === 'randomPick') {
    return (
      <RandomPickView node={node} edges={edges} map={map} playToken={playToken} played={played} hiding={hiding} vars={vars} schedule={schedule} clockMs={clockMs} urls={urls} depth={depth} crossAxis={crossAxis} />
    )
  }
  const mods = incoming(node.id, edges, map)
  // Audio Player and Random can both feed the same Text's Content socket at
  // once (it's `multi: true` — see TEXT_SOCKETS in components/nodes/
  // constants.ts) — each only ever SUPPLIES placeholder values, never
  // replaces the template, so merging them is exactly what wiring both in
  // means: {artist}/{title} AND {number}/{numbers}/{hash}/{seed} all
  // available together. variableValues is different: it's not gated by any
  // wiring at all — every Variable node ANYWHERE in the scene registers its
  // own `{name}` placeholder just by existing (see variablePlaceholderValues'
  // own doc comment), same "available without wiring" convention EVENT_
  // PLACEHOLDERS already uses for {user}/{amount}/{message}/{source}.
  const audioValues = node.type === 'text' ? audioContentValues(node.id, edges, map) : null
  const randomValues = node.type === 'text' ? randomContentValues(node.id, edges, map) : null
  const variableValues = node.type === 'text' ? variablePlaceholderValues(Object.values(map), globalVariables, twitchStats) : null
  const hasVariableValues = variableValues != null && Object.keys(variableValues).length > 0
  const contentValues = audioValues || randomValues || hasVariableValues ? { ...variableValues, ...audioValues, ...randomValues } : null
  // Clock is different from the three above: it's not a value resolved once
  // here, just a Format string — see clockFormatFor's own doc comment for
  // why TextView needs to own the actual `{time}` computation (and its own
  // 1s tick) itself.
  const clockFormat = node.type === 'text' ? clockFormatFor(node.id, edges, map) : null
  const replaceText = node.type === 'text' ? rouletteEntrantsTextValue(node.id, edges, map) : null
  const audioCover = node.type === 'image' && hasAudioCover(node.id, edges, map)
  // Task-agnostic, same reasoning as overflowAutoScroll's own doc comment —
  // a Task never wires its own Overflow, so this reads identically whether
  // or not a Process is currently driving `node`.
  const autoScroll = node.type === 'text' ? overflowAutoScroll(mods) : null
  if (schedule.length > 0 && schedule.some((s) => s.targetId === node.id)) {
    const task = computeTaskState(schedule, node.id, clockMs, mods)
    if (!task.visible) return null
    if (node.type === 'text') return <TextView node={node} style={task.style} anim={task.anim} played={true} hiding={task.hiding} vars={vars} contentValues={contentValues} replaceText={replaceText} crossAxis={crossAxis} autoScroll={autoScroll} clockFormat={clockFormat} />
    if (node.type === 'image') return <ImageView node={node} style={task.style} anim={task.anim} played={true} hiding={task.hiding} urls={urls} audioCover={audioCover} />
    if (node.type === 'video') return <VideoView node={node} style={task.style} anim={task.anim} played={true} hiding={task.hiding} />
    if (node.type === 'progress') return <ProgressView node={node} style={task.style} anim={task.anim} played={true} hiding={task.hiding} mods={mods} edges={edges} map={map} />
    if (node.type === 'rouletteWidget') return <RouletteWheelView node={node} style={task.style} anim={task.anim} played={true} hiding={task.hiding} />
    if (node.type === 'randomWidget') return <RandomWidgetView node={node} style={task.style} anim={task.anim} played={true} hiding={task.hiding} mods={mods} />
    return null
  }
  const style = modifierStyle(mods)
  const anim = animationAttrs(mods)
  if (node.type === 'text') return <TextView node={node} style={style} anim={anim} played={played} hiding={hiding} vars={vars} contentValues={contentValues} replaceText={replaceText} crossAxis={crossAxis} autoScroll={autoScroll} clockFormat={clockFormat} />
  if (node.type === 'image') return <ImageView node={node} style={style} anim={anim} played={played} hiding={hiding} urls={urls} audioCover={audioCover} />
  if (node.type === 'video') return <VideoView node={node} style={style} anim={anim} played={played} hiding={hiding} />
  if (node.type === 'progress') return <ProgressView node={node} style={style} anim={anim} played={played} hiding={hiding} mods={mods} edges={edges} map={map} />
  if (node.type === 'rouletteWidget') return <RouletteWheelView node={node} style={style} anim={anim} played={played} hiding={hiding} />
  if (node.type === 'randomWidget') return <RandomWidgetView node={node} style={style} anim={anim} played={played} hiding={hiding} mods={mods} />
  return null
}
