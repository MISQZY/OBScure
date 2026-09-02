import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'

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
 * X/Y (not 4 independent sides), same symmetric convention Shape's own old
 * Padding fields used — simpler than a full per-side box model, and nothing
 * here needed the extra precision yet.
 *
 * Build-time only, like Overflow — not in TASK_SOCKETS' own narrower Style
 * list, so a Task can't override either mid-process (see modifierStyle's own
 * doc comment in sceneUtils/style.ts for the one place Margin's `marginTop`/
 * `marginLeft` interact with a wired Position's own center-anchor trick).
 */
export function SpacingNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  return (
    <BaseNode id={id} data={data} title="Spacing" category="style">
      <Field label="Padding X">
        <NumberInput value={data.paddingX as number} onChange={(v) => updateNodeData(id, { paddingX: v })} min={0} fallback={0} className={numberInputClass} />
      </Field>
      <Field label="Padding Y">
        <NumberInput value={data.paddingY as number} onChange={(v) => updateNodeData(id, { paddingY: v })} min={0} fallback={0} className={numberInputClass} />
      </Field>
      <Field label="Margin X">
        <NumberInput value={data.marginX as number} onChange={(v) => updateNodeData(id, { marginX: v })} fallback={0} className={numberInputClass} />
      </Field>
      <Field label="Margin Y">
        <NumberInput value={data.marginY as number} onChange={(v) => updateNodeData(id, { marginY: v })} fallback={0} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}
