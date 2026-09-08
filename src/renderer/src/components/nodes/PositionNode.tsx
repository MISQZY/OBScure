import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'

import { useSavedNodeData, BaseNode, Field, NumberInput, NodeSelect, numberInputClass } from './utils'

export function PositionNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const mode = (data.mode as string) || 'absolute'
  const anchor = (data.anchor as string) || 'top-left'

  return (
    <BaseNode id={id} data={data} title="Position" category="style">
      <Field label="Mode">
        <NodeSelect
          value={mode}
          options={['absolute', 'relative'] as const}
          onChange={(next) => updateNodeData(id, { mode: next })}
        />
      </Field>
      {mode === 'absolute' && (
        <Field label="Anchor">
          <NodeSelect
            value={anchor}
            options={[
              'top-left', 'top-center', 'top-right',
              'center-left', 'center', 'center-right',
              'bottom-left', 'bottom-center', 'bottom-right'
            ] as const}
            onChange={(next) => updateNodeData(id, { anchor: next })}
          />
        </Field>
      )}
      <Field label={mode === 'absolute' ? 'Offset X' : 'Shift X'}>
        <NumberInput value={data.x as number} onChange={(v) => updateNodeData(id, { x: v })} fallback={0} savedValue={saved.x as number} className={numberInputClass} />
      </Field>
      <Field label={mode === 'absolute' ? 'Offset Y' : 'Shift Y'}>
        <NumberInput value={data.y as number} onChange={(v) => updateNodeData(id, { y: v })} fallback={0} savedValue={saved.y as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}
