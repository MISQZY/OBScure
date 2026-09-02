import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'

import { useI18n } from '@/providers/I18nProvider'
import { PROGRESS_SOCKETS, PROGRESS_OUTPUTS } from './constants'
import { useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, NodeSelect, numberInputClass, PROGRESS_ORIENTATIONS } from './utils'

/**
 * A goal/progress bar. Current/Target each come from a wired Variable node
 * (see PROGRESS_SOCKETS/VariableNode) rather than living on this node —
 * that's what lets a future live-stat feed (a follower/sub/donation count)
 * plug straight in later without this node changing at all. Label is
 * likewise a wired Text node, rendered with THAT node's own full styling
 * (see ProgressView/buildProgress) — everything left here is just the bar's
 * own look (orientation/colors/thickness/radius).
 */
export function ProgressNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const { t } = useI18n()
  const saved = useSavedNodeData(id)
  const orientation = (data.orientation as string) || 'horizontal'
  return (
    <BaseNode
      id={id}
      data={data}
      title="Progress Bar"
      labelable
      category="content"
      sockets={PROGRESS_SOCKETS}
      outputSockets={PROGRESS_OUTPUTS}
      help={t.sceneBuilder.tooltip.nodes.progress}
    >
      <Field label="Orientation">
        <NodeSelect value={orientation} options={PROGRESS_ORIENTATIONS} onChange={(next) => updateNodeData(id, { orientation: next })} />
      </Field>
      <Field label="Bar color">
        <ColorPicker value={(data.barColor as string) || '#8b5cf6'} onChange={(val) => updateNodeData(id, { barColor: val })} />
      </Field>
      <Field label="Track color">
        <ColorPicker value={(data.trackColor as string) || '#3f3f46'} onChange={(val) => updateNodeData(id, { trackColor: val })} />
      </Field>
      <Field label="Thickness">
        <NumberInput value={data.thickness as number} onChange={(v) => updateNodeData(id, { thickness: v })} min={2} fallback={28} savedValue={saved.thickness as number} className={numberInputClass} />
      </Field>
      <Field label="Radius">
        <NumberInput value={data.borderRadius as number} onChange={(v) => updateNodeData(id, { borderRadius: v })} min={0} fallback={14} savedValue={saved.borderRadius as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}
