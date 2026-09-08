import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { ANIMATION_IDS } from '@shared/overlayConfig'

import { useSavedNodeData, BaseNode, Field, NumberInput, NodeSelect, numberInputClass, ANIMATION_SUB_TYPES } from './utils'

export function AnimationNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const type = (data.type as string) || 'fade'
  return (
    <BaseNode id={id} data={data} title="Animation" category="style">
      <Field label="Type">
        <NodeSelect
          value={type}
          options={ANIMATION_IDS}
          onChange={(next) => updateNodeData(id, { type: next })}
        />
      </Field>
      <Field label="Duration">
        <NumberInput value={data.duration as number} onChange={(v) => updateNodeData(id, { duration: v })} min={0} fallback={500} savedValue={saved.duration as number} className={numberInputClass} />
      </Field>
      {type !== 'none' && (
        <Field label="Sub-type">
          <NodeSelect
            value={(data.subType as string) || 'auto'}
            options={ANIMATION_SUB_TYPES}
            onChange={(next) => updateNodeData(id, { subType: next })}
          />
        </Field>
      )}
    </BaseNode>
  )
}
