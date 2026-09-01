import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'

import { useI18n } from '@/providers/I18nProvider'
import { TASK_SOCKETS } from './constants'
import { BaseNode, Field, NodeSelect, TASK_ACTIONS } from './utils'

/**
 * One step in a Process: shows, hides, or updates ONE component — whichever
 * Text/Image/Box is wired into this Task's own Target socket (see
 * TASK_SOCKETS above). Animation/Position/Size/Transform each get their own
 * dedicated socket too, instead of piling onto Target (an Animation on a
 * Show/Hide plays as the entrance/exit; on Update it's ignored — Update
 * only ever changes Position/Size/Transform without touching visibility).
 * Its output is the next sequence-flow step — another Task, a Wait, or End.
 */
export function TaskNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const { t } = useI18n()
  return (
    <BaseNode
      id={id}
      data={data}
      title="Task"
      labelable
      category="process"
      sockets={TASK_SOCKETS}
      sequenceIn
      help={t.sceneBuilder.tooltip.nodes.task}
    >
      <Field label="Action">
        <NodeSelect
          value={(data.action as string) || 'show'}
          options={TASK_ACTIONS}
          onChange={(next) => updateNodeData(id, { action: next })}
        />
      </Field>
    </BaseNode>
  )
}
