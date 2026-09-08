import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'

import { useSavedNodeData, BaseNode, Field, NumberInput, numberInputClass } from './utils'

export function TransformNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  return (
    <BaseNode id={id} data={data} title="Transform" category="style">
      <Field label="Scale X">
        <NumberInput value={data.scaleX as number} onChange={(v) => updateNodeData(id, { scaleX: v })} fallback={1} savedValue={saved.scaleX as number} className={numberInputClass} />
      </Field>
      <Field label="Scale Y">
        <NumberInput value={data.scaleY as number} onChange={(v) => updateNodeData(id, { scaleY: v })} fallback={1} savedValue={saved.scaleY as number} className={numberInputClass} />
      </Field>
      <Field label="Rotation">
        <NumberInput value={data.rotation as number} onChange={(v) => updateNodeData(id, { rotation: v })} fallback={0} savedValue={saved.rotation as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}
