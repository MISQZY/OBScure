import React, { useEffect } from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { Maximize } from 'lucide-react'

import { BaseNode, Field, NumberInput, numberInputClass } from './utils'

/**
 * Inside (padding) and outside (margin) space, wireable into ANY content
 * node's own Style socket (see MODIFIER_SOCKETS' own doc comment) — the same
 * "small single-concern modifier" shape as Position/Size/Opacity/Shadow
 * rather than a field baked into one specific node type. Replaces Shape's
 * (BoxNode.tsx) former built-in Padding X/Y fields, which only ever affected
 * a Box's own inside — this works on Text/Image/Video/Box/widgets alike, and
 * covers outside spacing too, which nothing offered before.
 *
 * Each group (Padding/Margin) is one main field plus an expand/collapse
 * toggle (static icon — only the 4 fields below appear/disappear, same as
 * Text's own {} placeholder button styling), Figma-style: collapsed
 * (default) drives all 4 sides from the single field; expanded reveals
 * Top/Right/Bottom/Left below for independent values. The
 * per-side fields (`paddingTop`/etc., see spacingSides below) are what
 * actually renders (modifierStyle in sceneUtils/style.ts) — a scene saved
 * before this existed only ever has the old symmetric `paddingX`/`paddingY`/
 * `marginX`/`marginY` pair, which spacingSides falls back to per axis (X ->
 * left/right, Y -> top/bottom) so it keeps rendering unchanged until edited.
 *
 * Build-time only, like Overflow — not in TASK_SOCKETS' own narrower Style
 * list, so a Task can't override either mid-process (see modifierStyle's own
 * doc comment in sceneUtils/style.ts for the one place Margin's `marginTop`/
 * `marginLeft` interact with a wired Position's own center-anchor trick).
 */
export function spacingSides(
  data: Record<string, unknown>,
  prefix: 'padding' | 'margin'
): { top: number; right: number; bottom: number; left: number } {
  const x = (data[`${prefix}X`] as number) ?? 0
  const y = (data[`${prefix}Y`] as number) ?? 0
  return {
    top: (data[`${prefix}Top`] as number) ?? y,
    right: (data[`${prefix}Right`] as number) ?? x,
    bottom: (data[`${prefix}Bottom`] as number) ?? y,
    left: (data[`${prefix}Left`] as number) ?? x
  }
}

function SpacingGroup({
  id,
  data,
  prefix,
  label,
  min
}: {
  id: string
  data: Record<string, unknown>
  prefix: 'padding' | 'margin'
  label: string
  min?: number
}) {
  const { updateNodeData } = useReactFlow()
  const expanded = Boolean(data[`${prefix}Expanded`])
  const sides = spacingSides(data, prefix)
  const sidesInSync = sides.top === sides.right && sides.top === sides.bottom && sides.top === sides.left

  // A scene saved before per-side fields existed only ever has the legacy
  // `paddingX`/`paddingY` (or margin) pair, which spacingSides falls back to
  // per axis — so an asymmetric X/Y (e.g. paddingX=16, paddingY=8) surfaces
  // here as sides that already disagree the very first time this node is
  // shown. Force it open in that case rather than showing the misleading
  // "one value" collapsed field, whose own onChange (setAll, below) would
  // otherwise silently overwrite the hidden, differing side on the user's
  // very next touch with no warning.
  useEffect(() => {
    if (!expanded && !sidesInSync) updateNodeData(id, { [`${prefix}Expanded`]: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The main field is a "set all" shortcut, not its own stored value — it
  // always writes all 4 sides at once, so diverging them via the per-side
  // fields below and coming back to this one resets them back in sync.
  const setAll = (v: number | null) => {
    const value = v ?? 0
    updateNodeData(id, {
      [`${prefix}Top`]: value,
      [`${prefix}Right`]: value,
      [`${prefix}Bottom`]: value,
      [`${prefix}Left`]: value
    })
  }

  return (
    <>
      <Field label={label}>
        <div className="flex items-center gap-1">
          <NumberInput value={sides.top} onChange={setAll} min={min} fallback={0} className={numberInputClass} />
          <button
            type="button"
            onClick={() => updateNodeData(id, { [`${prefix}Expanded`]: !expanded })}
            title={expanded ? `Use one value for all ${label.toLowerCase()} sides` : `Set each ${label.toLowerCase()} side independently`}
            className="nodrag h-6 px-1.5 rounded bg-muted hover:bg-accent border border-transparent hover:border-border text-muted-foreground hover:text-accent-foreground shrink-0 flex items-center justify-center"
          >
            <Maximize className="size-3" />
          </button>
        </div>
      </Field>
      {expanded && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 pl-2">
          <Field label="Top">
            <NumberInput value={sides.top} onChange={(v) => updateNodeData(id, { [`${prefix}Top`]: v ?? 0 })} min={min} fallback={0} className={numberInputClass} />
          </Field>
          <Field label="Right">
            <NumberInput value={sides.right} onChange={(v) => updateNodeData(id, { [`${prefix}Right`]: v ?? 0 })} min={min} fallback={0} className={numberInputClass} />
          </Field>
          <Field label="Bottom">
            <NumberInput value={sides.bottom} onChange={(v) => updateNodeData(id, { [`${prefix}Bottom`]: v ?? 0 })} min={min} fallback={0} className={numberInputClass} />
          </Field>
          <Field label="Left">
            <NumberInput value={sides.left} onChange={(v) => updateNodeData(id, { [`${prefix}Left`]: v ?? 0 })} min={min} fallback={0} className={numberInputClass} />
          </Field>
        </div>
      )}
    </>
  )
}

export function SpacingNode({ id, data }: NodeProps) {
  return (
    <BaseNode id={id} data={data} title="Spacing" category="style">
      <SpacingGroup id={id} data={data} prefix="padding" label="Padding" min={0} />
      <SpacingGroup id={id} data={data} prefix="margin" label="Margin" />
    </BaseNode>
  )
}
