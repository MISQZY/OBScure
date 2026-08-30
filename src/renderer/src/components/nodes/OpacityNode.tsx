import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'

import { BaseNode, Field } from './utils'

/** Constant transparency (0–100%) on whatever it's wired into — separate from Animation's fade, which only plays a transition, not a resting state. Wire into a Task's own Opacity socket too, to fade something in/out as a process step instead of (or alongside) Animation's fade type. */
export function OpacityNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const value = (data.value as number) ?? 100
  return (
    <BaseNode id={id} data={data} title="Opacity" category="style">
      <Field label="Opacity">
        <input type="range" min="0" max="100" step="1" value={value} onChange={(e) => updateNodeData(id, { value: Number(e.target.value) })} className="nodrag w-24" />
        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{value}%</span>
      </Field>
    </BaseNode>
  )
}
