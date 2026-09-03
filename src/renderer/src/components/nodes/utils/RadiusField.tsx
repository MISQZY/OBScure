import { useReactFlow } from '@xyflow/react'
import { Maximize } from 'lucide-react'

import { Field } from './BaseNode'
import { NumberInput } from './NumberInput'
import { numberInputClass } from './constants'

/**
 * A rounded-rectangle node's "Radius" field (Box/Image/Video/Progress) —
 * same expand-to-independent-values shape as Spacing's Padding/Margin (see
 * SpacingNode.tsx's own doc comment): one main field plus an expand toggle
 * styled off Text's own {} placeholder button (PlaceholderPicker.tsx),
 * static icon — collapsed (default) drives all 4 corners from the single
 * field; expanded reveals Top-Left/Top-Right/Bottom-Left/Bottom-Right below
 * for independent values. The per-corner fields (`borderRadiusTopLeft`/etc.,
 * see radiusCorners in sceneUtils/style.ts) are what actually renders — a
 * scene saved before this existed only ever has the old flat `borderRadius`,
 * which radiusCorners falls back to for every corner, so it keeps rendering
 * unchanged until edited.
 */
export function RadiusField({
  id,
  data,
  label = 'Radius',
  min = 0,
  fallback
}: {
  id: string
  data: Record<string, unknown>
  label?: string
  min?: number
  /** This node type's own default when nothing's ever been set (Box 10, Image/Video 8, Progress 14) — matches radiusCorners' own `fallback` param. */
  fallback: number
}) {
  const { updateNodeData } = useReactFlow()
  const expanded = Boolean(data.borderRadiusExpanded)
  const base = (data.borderRadius as number) ?? fallback
  const topLeft = (data.borderRadiusTopLeft as number) ?? base
  const topRight = (data.borderRadiusTopRight as number) ?? base
  const bottomLeft = (data.borderRadiusBottomLeft as number) ?? base
  const bottomRight = (data.borderRadiusBottomRight as number) ?? base

  // The main field is a "set all" shortcut, not its own stored value — it
  // always writes all 4 corners (and the legacy `borderRadius` field, so a
  // scene re-saved from here still degrades cleanly on an older build) at
  // once, so diverging them via the per-corner fields below and coming back
  // to this one resets them back in sync.
  const setAll = (v: number | null) => {
    const value = v ?? fallback
    updateNodeData(id, {
      borderRadius: value,
      borderRadiusTopLeft: value,
      borderRadiusTopRight: value,
      borderRadiusBottomLeft: value,
      borderRadiusBottomRight: value
    })
  }

  return (
    <>
      <Field label={label}>
        <div className="flex items-center gap-1">
          <NumberInput value={topLeft} onChange={setAll} min={min} fallback={fallback} className={numberInputClass} />
          <button
            type="button"
            onClick={() => updateNodeData(id, { borderRadiusExpanded: !expanded })}
            title={expanded ? `Use one value for all ${label.toLowerCase()} corners` : `Set each ${label.toLowerCase()} corner independently`}
            className="nodrag h-6 px-1.5 rounded bg-muted hover:bg-accent border border-transparent hover:border-border text-muted-foreground hover:text-accent-foreground shrink-0 flex items-center justify-center"
          >
            <Maximize className="size-3" />
          </button>
        </div>
      </Field>
      {expanded && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 pl-2">
          <Field label="Top-Left">
            <NumberInput value={topLeft} onChange={(v) => updateNodeData(id, { borderRadiusTopLeft: v ?? fallback })} min={min} fallback={fallback} className={numberInputClass} />
          </Field>
          <Field label="Top-Right">
            <NumberInput value={topRight} onChange={(v) => updateNodeData(id, { borderRadiusTopRight: v ?? fallback })} min={min} fallback={fallback} className={numberInputClass} />
          </Field>
          <Field label="Bottom-Left">
            <NumberInput value={bottomLeft} onChange={(v) => updateNodeData(id, { borderRadiusBottomLeft: v ?? fallback })} min={min} fallback={fallback} className={numberInputClass} />
          </Field>
          <Field label="Bottom-Right">
            <NumberInput value={bottomRight} onChange={(v) => updateNodeData(id, { borderRadiusBottomRight: v ?? fallback })} min={min} fallback={fallback} className={numberInputClass} />
          </Field>
        </div>
      )}
    </>
  )
}
