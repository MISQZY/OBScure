import React from 'react'
import { NodeProps } from '@xyflow/react'

import { useI18n } from '@/providers/I18nProvider'
import { SCENE_SOCKETS } from './constants'
import { BaseNode } from './utils'

/** The output — the single sink every scene needs. Only what's connected here (directly or via a Box) ends up on the OBS overlay page. One per scene, can't be deleted. */
export function SceneNode({ id, data }: NodeProps) {
  const { t } = useI18n()
  return (
    <BaseNode
      id={id}
      data={data}
      title="Scene"
      outputs={false}
      deletable={false}
      category="content"
      sockets={SCENE_SOCKETS}
      help={t.sceneBuilder.tooltip.nodes.scene}
    />
  )
}
