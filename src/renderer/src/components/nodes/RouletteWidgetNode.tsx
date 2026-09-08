import React from 'react'
import { NodeProps } from '@xyflow/react'

import { useI18n } from '@/providers/I18nProvider'
import { ROULETTE_WIDGET_SOCKETS, ROULETTE_WIDGET_OUTPUTS } from './constants'
import { BaseNode } from './utils'

/**
 * The actual on-screen spinning wheel — always created and permanently
 * paired with exactly one Roulette node the moment that's placed (never
 * offered in the Add Node palette on its own — see addNode's own doc
 * comment in hooks/useSceneGraph.ts). Its own `source` socket carries that
 * pairing edge and can't be repointed at a different Roulette or
 * disconnected (useSceneGraph's onNodesChange/onEdgesChange refuse to let
 * either half of the pair, or the edge between them, be removed alone —
 * deleting one takes the other with it). A plain content node otherwise —
 * same Transform/Style sockets and Content/Target outputs as Text/Image/
 * Video/Box, so it can be positioned, sized, animated, or handed to a Task
 * exactly like any of those.
 *
 * Shows UNCONDITIONALLY by default once wired into Scene/a Shape, same as
 * any other content node — its own `visible` socket is optional: leave it
 * unwired and the wheel just always renders; wire the SAME Roulette's Event
 * output into it to instead hide this SPECIFIC widget outside an active
 * round (phase 'idle'). Deliberately per-widget, not scene-wide — Event
 * wired into a Start node arms a PROCESS on round-start instead (a
 * completely separate concern from this widget's own visibility; see
 * ROULETTE_OUTPUTS' own doc comment in constants.ts).
 *
 * `deletable={false}`: no Trash2 button or Duplicate/Delete context-menu
 * entries of its OWN — the pairing is mandatory in this direction, so the
 * only way this node goes away is by deleting its Roulette (which cascades
 * to it — see onNodesChange in hooks/useSceneGraph.ts). Purely a UI-layer
 * restriction — the node itself is still perfectly deletable via that
 * cascade, this just removes the confusing "delete just the widget, leaving
 * an orphaned Roulette" affordance. Contrast with Roulette Entrants (see
 * RouletteEntrantsNode.tsx), which keeps its own delete button.
 */
export function RouletteWidgetNode({ id, data }: NodeProps) {
  const { t } = useI18n()
  return (
    <BaseNode
      id={id}
      data={data}
      title="Roulette Widget"
      category="content"
      deletable={false}
      sockets={ROULETTE_WIDGET_SOCKETS}
      outputSockets={ROULETTE_WIDGET_OUTPUTS}
      help={t.sceneBuilder.tooltip.nodes.rouletteWidget}
    />
  )
}
