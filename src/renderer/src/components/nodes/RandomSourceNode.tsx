import React from 'react'
import { NodeProps } from '@xyflow/react'

import { useI18n } from '@/providers/I18nProvider'
import { RANDOM_OUTPUTS } from './constants'
import { BaseNode } from './utils'

/**
 * Live commit/reveal state from the Random tool (RandomEngine, driven by the
 * Roll/Reveal buttons on RandomToolPage.tsx — min/max/count come from that
 * page's own saved config, not from this node). Placing this ALSO places a
 * permanently-paired Random Widget (see addNode's own doc comment in
 * hooks/useSceneGraph.ts) — that's the node you actually wire into Scene to
 * show the rolling numbers; this one stays a pure data/control node, same
 * family as Roulette/Audio Player/Event. See RANDOM_OUTPUTS' own doc comment
 * in constants.ts for exactly what each output does and where to wire it;
 * that's also surfaced here as each row's own "?" help.
 */
export function RandomSourceNode({ id, data }: NodeProps) {
  const { t } = useI18n()
  return (
    <BaseNode
      id={id}
      data={data}
      title="Random"
      category="data"
      outputSockets={RANDOM_OUTPUTS}
      help={t.sceneBuilder.tooltip.nodes.randomSource}
    />
  )
}
