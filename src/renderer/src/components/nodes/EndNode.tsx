import React from 'react'
import { NodeProps } from '@xyflow/react'

import { useI18n } from '@/providers/I18nProvider'
import { BaseNode } from './utils'

/**
 * The exit point of a Process — reaching it (via sequence flow from the
 * last Task/Wait) tears the whole scene down: Background FX/Sound stop and
 * every Task-controlled component clears, the same final cleanup the older
 * single-duration model did at the end of its Timer. No fields of its own —
 * just a place for the chain to end. Not connecting one at all means the
 * process never explicitly finishes; see buildProcessSchedule for how that
 * degrades (the chain is walked until it runs out of next steps).
 */
export function EndNode({ id, data }: NodeProps) {
  const { t } = useI18n()
  return (
    <BaseNode
      id={id}
      data={data}
      title="End"
      outputs={false}
      category="process"
      sequenceIn
      help={t.sceneBuilder.tooltip.nodes.end}
    />
  )
}
