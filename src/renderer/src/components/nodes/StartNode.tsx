import React from 'react'
import { NodeProps } from '@xyflow/react'

import { useI18n } from '@/providers/I18nProvider'
import { START_SOCKETS } from './constants'
import { BaseNode } from './utils'

/**
 * The entry point of a Process (see the Start/Task/Wait/End doc comment at
 * the top of this file). Connect an Event node into it to pick which alert
 * type arms the whole sequence — the same role Event plays wired into Scene
 * for the older single show/hide model, just wired here instead. A Sound or
 * Background FX node connected here fires once when the process starts,
 * same idea. Its output is the first sequence-flow edge, into a Task or
 * Wait.
 */
export function StartNode({ id, data }: NodeProps) {
  const { t } = useI18n()
  return (
    <BaseNode
      id={id}
      data={data}
      title="Start"
      category="process"
      sockets={START_SOCKETS}
      help={t.sceneBuilder.tooltip.nodes.start}
    />
  )
}
