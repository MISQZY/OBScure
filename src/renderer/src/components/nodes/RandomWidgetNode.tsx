import React from 'react'
import { NodeProps } from '@xyflow/react'

import { RANDOM_WIDGET_SOCKETS, RANDOM_WIDGET_OUTPUTS } from './constants'
import { BaseNode } from './utils'

/**
 * The actual on-screen rolling numbers — always created and permanently
 * paired with exactly one Random node the moment that's placed (never
 * offered in the Add Node palette on its own — see addNode's own doc
 * comment in hooks/useSceneGraph.ts). Its own `source` socket carries that
 * pairing edge and can't be repointed at a different Random or disconnected
 * (useSceneGraph's onNodesChange/onEdgesChange refuse to let either half of
 * the pair, or the edge between them, be removed alone — deleting one takes
 * the other with it). A plain content node otherwise — same Transform/Style
 * sockets and Structural/Target outputs as Text/Image/Video/Box, so it can
 * be positioned, sized, animated, or handed to a Task exactly like any of
 * those.
 *
 * Shows UNCONDITIONALLY by default once wired into Scene/a Shape, same as
 * any other content node — its own `visible` socket is optional: leave it
 * unwired and the numbers just always render (empty/idle otherwise), or wire
 * the SAME Random's Event output into it to instead hide this SPECIFIC
 * widget outside an active roll (phase 'idle'). Deliberately per-widget, not
 * scene-wide — Event wired into a Start node arms a PROCESS on commit
 * instead (a completely separate concern from this widget's own visibility;
 * see RANDOM_OUTPUTS' own doc comment in constants.ts).
 *
 * `deletable={false}`: no Trash2 button or Duplicate/Delete context-menu
 * entries of its OWN — the pairing is mandatory in this direction, so the
 * only way this node goes away is by deleting its Random (which cascades to
 * it — see onNodesChange in hooks/useSceneGraph.ts). Purely a UI-layer
 * restriction — this just removes the confusing "delete just the widget,
 * leaving an orphaned Random" affordance. Contrast with Roulette Widget's
 * own sibling Entrants node (see RouletteEntrantsNode.tsx), which keeps its
 * own delete button — Random has no node like it (see RANDOM_OUTPUTS' own
 * doc comment in constants.ts for why).
 */
export function RandomWidgetNode({ id, data }: NodeProps) {
  return (
    <BaseNode
      id={id}
      data={data}
      title="Random Widget"
      category="content"
      deletable={false}
      sockets={RANDOM_WIDGET_SOCKETS}
      outputSockets={RANDOM_WIDGET_OUTPUTS}
      help="The rolling numbers — always paired 1:1 with its own Random node. Shows unconditionally unless you wire that Random's own Event output into this node's own Visibility socket. Delete its Random to remove both together."
    />
  )
}
