import React from 'react'
import { NodeProps } from '@xyflow/react'

import { BOX_SOCKETS, BOX_OUTPUTS } from './constants'
import { BaseNode } from './utils'

/**
 * A plain grouping container — same Children/Layout/Transform/Style sockets
 * and the same flex arrangement as a Shape (Box), just with none of its
 * decorative fields (no background, padding, corner shape, or border): an
 * invisible wrapper purely for arranging a cluster of Text/Image/Video/
 * Box/Group as one unit (position it, animate it, or hand it to a Task as
 * one Target) without adding a visible card behind them, the way Box would.
 * See BOX_SOCKETS' own doc comment for how Box and Group nest into each
 * other, and BoxView/buildBox for the shared rendering (branching only on
 * `node.type === 'box'` for the decorative styling this node skips).
 */
export function GroupNode({ id, data }: NodeProps) {
  return (
    <BaseNode
      id={id}
      data={data}
      title="Group"
      labelable
      category="content"
      sockets={BOX_SOCKETS}
      outputSockets={BOX_OUTPUTS}
      help="An invisible wrapper — no background, padding, or border. Wire Text/Image/Video/Box/Group into it to arrange or move them as one unit."
    />
  )
}
