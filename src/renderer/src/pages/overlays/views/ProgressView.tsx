import { Node, Edge } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useGlobalVariables } from "@/providers/GlobalVariablesProvider";
import { useTwitchStats } from "@/providers/TwitchStatsProvider";
import { progressSourceValue, variablePlaceholderValues, clockFormatFor, NodeMap, Anim } from "../sceneUtils";
import { TextView } from "./TextView";

/** current/target clamped to a 0-100 fill percent — mirrors progressPercent in overlays/custom-builders.js. 0 when target isn't positive (no divide-by-zero/negative-width fill). */
function progressPercent(current: number, target: number): number {
  if (!(target > 0)) return 0
  return Math.max(0, Math.min(100, (current / target) * 100))
}

export function ProgressView({
  node,
  style,
  anim,
  played,
  hiding,
  mods,
  edges,
  map
}: {
  node: Node
  style: React.CSSProperties
  anim: Anim
  played: boolean
  hiding: boolean
  /** Same list `style` was already built from — read again here to find a wired Label Text node (unambiguous by type, since 'text' only ever lands on Progress's own `label` socket — see PROGRESS_SOCKETS). */
  mods: Node[]
  /** Needed alongside `map` to resolve Current/Target — see progressSourceValue's own doc comment for why that can't just be another `mods`/lastOfType lookup like every other modifier here. */
  edges: Edge[]
  map: NodeMap
}) {
  const { variables: globalVariables } = useGlobalVariables()
  const twitchStats = useTwitchStats()
  const d = node.data
  const orientation = (d.orientation as string) === 'vertical' ? 'vertical' : 'horizontal'
  const current = progressSourceValue(node.id, 'current', edges, map, globalVariables, twitchStats)
  const target = progressSourceValue(node.id, 'target', edges, map, globalVariables, twitchStats)
  const percent = progressPercent(current, target)
  const thickness = (d.thickness as number) ?? 28
  const radius = (d.borderRadius as number) ?? 14
  const labelNode = mods.find((m) => m.type === 'text')
  return (
    <div
      className={cn(anim && played && 'visible', anim && hiding && 'hiding')}
      data-animation={anim?.type}
      style={
        {
          position: 'relative',
          width: orientation === 'horizontal' ? 240 : thickness,
          height: orientation === 'horizontal' ? thickness : 240,
          ...style,
          borderRadius: `${radius}px`,
          overflow: 'hidden',
          background: (d.trackColor as string) || '#3f3f46',
          flexShrink: 0,
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          top: orientation === 'horizontal' ? 0 : undefined,
          right: orientation === 'vertical' ? 0 : undefined,
          width: orientation === 'horizontal' ? `${percent}%` : '100%',
          height: orientation === 'horizontal' ? '100%' : `${percent}%`,
          background: (d.barColor as string) || '#8b5cf6',
          transition: 'width 300ms ease, height 300ms ease'
        }}
      />
      {labelNode && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <TextView
            node={labelNode}
            style={{}}
            anim={null}
            played={true}
            hiding={false}
            vars={null}
            contentValues={{
              ...variablePlaceholderValues(Object.values(map), globalVariables, twitchStats),
              current: String(current),
              target: String(target),
              percent: String(Math.round(percent))
            }}
            replaceText={null}
            crossAxis="horizontal"
            autoScroll={null}
            clockFormat={clockFormatFor(labelNode.id, edges, map)}
          />
        </div>
      )}
    </div>
  )
}
