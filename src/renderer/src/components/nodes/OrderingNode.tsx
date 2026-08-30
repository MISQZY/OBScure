import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'

import { useSavedNodeData, BaseNode, Field, NumberInput, NodeSelect, numberInputClass } from './utils'

/** Layout modifier: changes flex direction of a Box/Group or Scene. Connect into Box, Group, or Scene. */
export function OrderingNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  return (
    <BaseNode id={id} data={data} title="Ordering" category="style">
      <Field label="Layout">
        <NodeSelect
          value={(data.layout as string) || 'vertical'}
          options={['horizontal', 'vertical'] as const}
          onChange={(next) => updateNodeData(id, { layout: next })}
        />
      </Field>
      <Field label="Direction">
        <NodeSelect
          value={(data.direction as string) || 'direct'}
          options={['direct', 'revert'] as const}
          onChange={(next) => updateNodeData(id, { direction: next })}
        />
      </Field>
      <Field label="Gap">
        <NumberInput value={data.gap as number} onChange={(v) => updateNodeData(id, { gap: v })} min={0} fallback={8} savedValue={saved.gap as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}
