import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { Checkbox } from '@/components/ui/checkbox'

import { BaseNode, Field } from './utils'

/**
 * A manual, static visibility toggle — `display: none` in both ScenePreview
 * and overlays/custom.html (see the hide block in modifierStyle/
 * applyModifierStyle) when Hidden is checked (the default: adding this node
 * hides its target). Flipping the checkbox and Saving takes effect live
 * immediately, with no Play/Test/trigger involved (see the doc comment on
 * OverlayServer.setCustomOverlays for why Save intentionally doesn't replay
 * animations but DOES update content/state like this one) — this is for a
 * human flipping a switch during a broadcast (a "BRB" panel, say), NOT for
 * anything timed or event-driven. For that — an element that should
 * show/hide automatically when an alert fires, or as one step among several
 * over time — use a Task's own show/hide action instead (see TaskNode's own
 * doc comment): different job, timing vs. a manual switch, not a
 * duplicate of this.
 */
export function HideNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  return (
    <BaseNode id={id} data={data} title="Hide" category="style">
      <Field label="Hidden">
        <Checkbox
          checked={data.hidden !== false}
          onCheckedChange={(checked) => updateNodeData(id, { hidden: !!checked })}
          className="nodrag"
        />
      </Field>
    </BaseNode>
  )
}
