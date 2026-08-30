import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'

import { BaseNode, Field, NumberInput, numberInputClass } from './utils'

export function SizeNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  return (
    <BaseNode id={id} data={data} title="Size" category="style">
      <Field label="Width">
        <NumberInput value={data.width as number} onChange={(v) => updateNodeData(id, { width: v })} min={0} allowEmpty placeholder="auto" className={numberInputClass} />
      </Field>
      <Field label="Height">
        <NumberInput value={data.height as number} onChange={(v) => updateNodeData(id, { height: v })} min={0} allowEmpty placeholder="auto" className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}
