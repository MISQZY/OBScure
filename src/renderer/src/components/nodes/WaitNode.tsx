import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'

import { useSavedNodeData, BaseNode, Field, NumberInput, numberInputClass } from './utils'

/**
 * A pause in a Process's sequence flow — the time between the previous step
 * and the next one. Same field as the standalone Timer node (wired straight
 * into Scene for the older single-duration model); here it's inline in the
 * chain instead, and a Process can have as many as needed.
 */
export function WaitNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  return (
    <BaseNode id={id} data={data} title="Wait" category="process" sequenceIn>
      <Field label="Delay (ms)">
        <NumberInput value={data.delay as number} onChange={(v) => updateNodeData(id, { delay: v })} min={0} fallback={1000} savedValue={saved.delay as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}
