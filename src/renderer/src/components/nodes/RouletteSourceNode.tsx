import React from 'react'
import { NodeProps } from '@xyflow/react'

import { useI18n } from '@/providers/I18nProvider'
import { ROULETTE_OUTPUTS } from './constants'
import { BaseNode } from './utils'

/**
 * Live entrants/phase from the Roulette tool (RouletteEngine, driven by the
 * !roulette chat command / points redemptions / manual entries on the
 * Roulette settings page — see RouletteToolPage.tsx). Placing this ALSO
 * places a permanently-paired Roulette Widget (see addNode's own doc
 * comment in hooks/useSceneGraph.ts) — that's the node you actually wire
 * into Scene to show the wheel; this one stays a pure data/control node,
 * same family as Audio Player/Event. See ROULETTE_OUTPUTS' own doc comment
 * in constants.ts for exactly what each output does and where to wire it;
 * that's also surfaced here as each row's own "?" help.
 */
export function RouletteSourceNode({ id, data }: NodeProps) {
  const { t } = useI18n()
  return (
    <BaseNode
      id={id}
      data={data}
      title="Roulette"
      category="data"
      outputSockets={ROULETTE_OUTPUTS}
      help={t.sceneBuilder.tooltip.nodes.rouletteSource}
    />
  )
}
