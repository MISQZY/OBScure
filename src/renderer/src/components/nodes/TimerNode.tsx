import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'

import { useSavedNodeData, BaseNode, Field, NumberInput, numberInputClass } from './utils'

/**
 * Wired into Scene alongside an Event node, its Delay becomes how long (ms)
 * the event-triggered scene stays visible before auto-hiding — see the doc
 * comment on EventNode. Not wired into Scene at all: no effect yet (an
 * event-triggered scene without a Timer falls back to a fixed 6000ms — see
 * sceneTrigger in SceneBuilderPage.tsx / isEventTrigger in
 * overlays/custom.html).
 */
export function TimerNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  return (
    <BaseNode id={id} data={data} title="Timer" category="data">
      <Field label="Delay (ms)">
        <NumberInput value={data.delay as number} onChange={(v) => updateNodeData(id, { delay: v })} min={0} fallback={1000} savedValue={saved.delay as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}
