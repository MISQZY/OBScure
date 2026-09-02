import { Node, Edge } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { OverlayUrls } from "@shared/types";
import { useI18n } from "@/providers/I18nProvider";
import { interpolate } from "@/lib/i18n/interpolate";
import { buildNodeMap, incoming, orderingClass, orderingGap, crossAxisFor, ScheduledTask } from "../sceneUtils";
import { ImageView } from "./ImageView";
import { VideoView } from "./VideoView";
import { TextView } from "./TextView";
import { BoxView } from "./BoxView";
import { ContentView } from "./ContentView";

/** Live status of an event-triggered Scene (see sceneTrigger) — drives ScenePreview/BackgroundFxLayer's played/hiding/vars gating. */
export interface PreviewEventState {
  active: boolean
  /** Ignored when !active (a plain scene is always "visible"). True through BOTH the 'showing' and 'hiding' phases — content stays mounted while its exit animation plays. */
  visible: boolean
  /** True only during the 'hiding' phase — adds the .hiding class so animations.css plays each Animation node's exit instead of its entrance. Ignored when !active. */
  hiding: boolean
  vars: Record<string, unknown> | null
  alertTypes: string[]
}


/**
 * Renders exactly what overlays/custom.html renders for this node graph —
 * kept in step with it so both the in-editor preview and the real OBS
 * Browser Source agree on what a graph produces.
 *
 * Walks from the Scene node: whatever's wired into it (directly, or nested
 * inside a Box) is what's rendered — see the direction doc comment on
 * BaseNode in components/nodes/index.tsx. A scene saved before Scene existed
 * has no such node; for those, fall back to the old flat scan (first Box,
 * every Image, every Text) so it keeps rendering as it always did.
 *
 * When Scene is event-triggered (eventState.active), nothing renders at all
 * until eventState.visible — matches overlays/custom.html staying hidden
 * for a real Browser Source until a matching alert arrives; Play/Test
 * simulate that arrival (see handlePlay/handleTest in SceneBuilderPage).
 */
export function ScenePreview({
  nodes,
  edges,
  playToken,
  eventState,
  schedule,
  clockMs,
  urls
}: {
  nodes: Node[]
  edges: Edge[]
  playToken: number
  eventState: PreviewEventState
  /** A running Process's resolved Tasks (see buildProcessSchedule) — empty for a scene with no Start node, in which case rendering is exactly as it always was. */
  schedule: ScheduledTask[]
  clockMs: number
  urls: OverlayUrls | null
}) {
  const { t } = useI18n()
  const map = buildNodeMap(nodes)
  const scene = nodes.find((n) => n.type === 'scene')

  if (!scene) {
    const box = nodes.find((n) => n.type === 'box')
    const images = nodes.filter((n) => n.type === 'image')
    const videos = nodes.filter((n) => n.type === 'video')
    const texts = nodes.filter((n) => n.type === 'text')
    return (
      <div
        className="flex flex-col items-center gap-2"
        style={
          box
            ? {
                background: (box.data.background as string) || '#18181b',
                padding: `${(box.data.paddingY as number) ?? 12}px ${(box.data.paddingX as number) ?? 16}px`,
                borderRadius: `${(box.data.borderRadius as number) ?? 10}px`,
                border: box.data.borderEnabled
                  ? `${(box.data.borderWidth as number) ?? 2}px solid ${(box.data.borderColor as string) || '#ffffff'}`
                  : undefined
              }
            : undefined
        }
      >
        {images.map((n) => (
          <ImageView key={`${n.id}-${playToken}`} node={n} style={{}} anim={null} played={playToken > 0} hiding={false} urls={urls} audioCover={false} />
        ))}
        {videos.map((n) => (
          <VideoView key={`${n.id}-${playToken}`} node={n} style={{}} anim={null} played={playToken > 0} hiding={false} />
        ))}
        {texts.map((n) => (
          <TextView key={`${n.id}-${playToken}`} node={n} style={{}} anim={null} played={playToken > 0} hiding={false} vars={null} contentValues={null} replaceText={null} crossAxis="horizontal" />
        ))}
      </div>
    )
  }

  if (eventState.active && !eventState.visible) {
    return (
      <span className="text-white/40 text-xs text-center px-4">
        {/* alertTypes is empty when armed purely by Audio Player/Roulette (no Event — see processTrigger's audioArmed/rouletteArmed), neither of which has a "type" to name — describe the trigger instead of joining an empty list into a bare "Waiting for  —". */}
        {interpolate(t.sceneBuilder.preview.waitingForTypes, {
          types: eventState.alertTypes.length > 0 ? eventState.alertTypes.join(' / ') : t.sceneBuilder.preview.waitingForFallback
        })}
      </span>
    )
  }

  const orderMods = incoming(scene.id, edges, map)
  const renderable = orderMods.filter(
    (n) =>
      n.type === 'box' ||
      n.type === 'group' ||
      n.type === 'text' ||
      n.type === 'image' ||
      n.type === 'video' ||
      n.type === 'randomPick' ||
      n.type === 'rouletteWidget' ||
      n.type === 'randomWidget'
  )
  if (renderable.length === 0) {
    return <span className="text-white/40 text-xs text-center px-4">{t.sceneBuilder.preview.nothingConnected}</span>
  }

  const played = eventState.active || playToken > 0
  const hiding = eventState.active && eventState.hiding
  const crossAxis = crossAxisFor(orderMods)

  return (
    <div
      className={cn('relative w-full h-full flex items-center justify-center', orderingClass(orderMods))}
      style={{ gap: `${orderingGap(orderMods)}px` }}
    >
      {renderable.map((n) =>
        n.type === 'box' || n.type === 'group' ? (
          <BoxView
            key={`${n.id}-${playToken}`}
            node={n}
            edges={edges}
            map={map}
            playToken={playToken}
            played={played}
            hiding={hiding}
            vars={eventState.vars}
            schedule={schedule}
            clockMs={clockMs}
            urls={urls}
          />
        ) : (
          <ContentView
            key={`${n.id}-${playToken}`}
            node={n}
            edges={edges}
            map={map}
            playToken={playToken}
            played={played}
            hiding={hiding}
            vars={eventState.vars}
            schedule={schedule}
            clockMs={clockMs}
            urls={urls}
            crossAxis={crossAxis}
          />
        )
      )}
    </div>
  )
}
