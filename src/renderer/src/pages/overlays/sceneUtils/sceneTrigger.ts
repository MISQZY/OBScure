import { Node, Edge } from "@xyflow/react";
import { buildNodeMap, incoming } from "./graph";

/**
 * Whether Scene is wired to an Event node — if so, the scene is hidden
 * until a matching alert fires (for real: a live event; in the editor:
 * Play/Test simulating one), shows for `durationMs`, then hides again. See
 * EventNode/TimerNode's own doc comments in components/nodes/index.tsx,
 * and isEventTrigger — the same logic mirrored in overlays/custom.html.
 */
export function sceneTrigger(nodes: Node[], edges: Edge[]): { active: boolean; alertTypes: string[]; durationMs: number } {
  const scene = nodes.find((n) => n.type === 'scene')
  if (!scene) return { active: false, alertTypes: [], durationMs: 6000 }
  const map = buildNodeMap(nodes)
  const members = incoming(scene.id, edges, map)
  const alertTypes = [
    ...new Set(
      members
        .filter((n) => n.type === 'event')
        .map((n) => n.data.alertType as string)
        .filter(Boolean)
    )
  ]
  if (alertTypes.length === 0) return { active: false, alertTypes, durationMs: 6000 }
  const timer = members.find((n) => n.type === 'timer')
  const durationMs = (timer?.data.delay as number) || 6000
  return { active: true, alertTypes, durationMs }
}


/**
 * Whether Scene is wired to an Audio Player node via its own Event socket
 * (see the `event` entry on SCENE_SOCKETS in components/nodes/index.tsx,
 * which accepts 'audioPlayer' alongside 'event') — the continuously
 * data-driven, show-for-as-long-as-isPlaying visibility mode (see
 * AudioPlayerNode's own doc comment), mirrors isAudioTrigger in
 * overlays/custom.html. Only meaningful when sceneTrigger ISN'T already
 * active — a real Event always wins when both happen to be wired (same
 * priority order render()'s own isAudioTrigger branch uses in
 * overlays/custom.html), since the shared socket is single-value anyway.
 * Previously had no local equivalent at all — Play/Test simply did nothing
 * for a scene driven purely by Audio Player, unlike the real overlay, which
 * already simulated this via isAudioTrigger/showAudioContent.
 */
export function sceneAudioTrigger(nodes: Node[], edges: Edge[]): boolean {
  const scene = nodes.find((n) => n.type === 'scene')
  if (!scene) return false
  const map = buildNodeMap(nodes)
  return incoming(scene.id, edges, map).some((n) => n.type === 'audioPlayer')
}


/**
 * Fills {user}/{amount}/{message}/{source}-style placeholders (or
 * {artist}/{title} from audioContentValues — see TextView) from an event's
 * vars — mirrors interpolate() in overlays/custom.html. `vars` is null
 * outside an event-triggered show, in which case every placeholder is left
 * as literal text. A key NOT present in `vars` (as opposed to present but
 * empty) is left literal too, same reasoning — only actually-AVAILABLE
 * placeholders get filled in, so e.g. "{user}: {title}" with Event vars but
 * no {title} source keeps "{title}" literal instead of collapsing to a bare
 * "Viewer: ".
 */
export function interpolate(template: string, vars: Record<string, unknown> | null): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!(key in vars)) return match
    const value = vars[key]
    return value === undefined || value === null ? '' : String(value)
  })
}


/**
 * The Background FX node feeding a scene, if any — mirrors
 * showProcessContent/applyBackgroundFx in overlays/custom.html. For a
 * Process (a Start node exists), Background FX is wired into Start (the
 * trigger point) rather than Scene, same convention as Event/Sound;
 * otherwise connected to Scene when one exists, or a flat scan (pre-
 * Scene-node saves) like ScenePreview's own fallback branch.
 */
export function findBackgroundFx(nodes: Node[], edges: Edge[]): Node | undefined {
  const map = buildNodeMap(nodes)
  const start = nodes.find((n) => n.type === 'start')
  if (start) return incoming(start.id, edges, map).find((n) => n.type === 'backgroundAnimation')
  const scene = nodes.find((n) => n.type === 'scene')
  if (!scene) return nodes.find((n) => n.type === 'backgroundAnimation')
  return incoming(scene.id, edges, map).find((n) => n.type === 'backgroundAnimation')
}


/**
 * The Text node wired INTO a Background FX node, if any — its content
 * captions paratrooper's nickname tag / airdrop's crate label (see
 * BackgroundAnimationNode's own doc comment). Mirrors the same lookup in
 * overlays/custom.html's render().
 */
export function findBackgroundFxLabel(
  bgNode: Node | undefined,
  nodes: Node[],
  edges: Edge[],
  vars: Record<string, unknown> | null
): string {
  if (!bgNode) return ''
  const map = buildNodeMap(nodes)
  const textNode = incoming(bgNode.id, edges, map).find((n) => n.type === 'text')
  return interpolate((textNode?.data.text as string) || '', vars)
}
