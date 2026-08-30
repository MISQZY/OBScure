import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'

import { useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, numberInputClass } from './utils'

/**
 * A drop shadow — separate from Text's own old built-in always-on shadow
 * (that field is gone; nothing wired in now means no shadow at all, same
 * "absence = no effect" convention as every other modifier here). Applied
 * as `filter: drop-shadow(...)` rather than text-shadow/box-shadow so ONE
 * implementation works correctly on Text (per-glyph, like text-shadow would)
 * AND on a shaped Box (follows the shape's own clip-path outline, which
 * box-shadow — a plain rectangle unless you hand-sync its radius — would
 * get wrong on a circle/hexagon/diamond Box). See BoxNode's own doc comment
 * for the shape field.
 */
export function ShadowNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  return (
    <BaseNode id={id} data={data} title="Shadow" category="style">
      <Field label="Color">
        <ColorPicker value={(data.color as string) || '#000000'} onChange={(val) => updateNodeData(id, { color: val })} />
      </Field>
      <Field label="Opacity">
        <input type="range" min="0" max="100" step="1" value={(data.opacity as number) ?? 60} onChange={(e) => updateNodeData(id, { opacity: Number(e.target.value) })} className="nodrag w-24" />
        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{(data.opacity as number) ?? 60}%</span>
      </Field>
      <Field label="Blur">
        <NumberInput value={data.blur as number} onChange={(v) => updateNodeData(id, { blur: v })} min={0} fallback={6} savedValue={saved.blur as number} className={numberInputClass} />
      </Field>
      <Field label="Offset X">
        <NumberInput value={data.offsetX as number} onChange={(v) => updateNodeData(id, { offsetX: v })} fallback={0} savedValue={saved.offsetX as number} className={numberInputClass} />
      </Field>
      <Field label="Offset Y">
        <NumberInput value={data.offsetY as number} onChange={(v) => updateNodeData(id, { offsetY: v })} fallback={2} savedValue={saved.offsetY as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}
