import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { Checkbox } from '@/components/ui/checkbox'

import { BOX_SOCKETS, BOX_OUTPUTS } from './constants'
import { useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, NodeSelect, numberInputClass, BOX_SHAPE_IDS } from './utils'

export function BoxNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const borderEnabled = Boolean(data.borderEnabled)
  const shape = (data.shape as string) || 'rectangle'
  return (
    <BaseNode id={id} data={data} title="Shape" labelable category="content" sockets={BOX_SOCKETS} outputSockets={BOX_OUTPUTS}>
      <Field label="Background">
        <ColorPicker value={(data.background as string) || '#18181b'} onChange={(val) => updateNodeData(id, { background: val })} />
      </Field>
      <Field label="Padding X">
        <NumberInput value={data.paddingX as number} onChange={(v) => updateNodeData(id, { paddingX: v })} min={0} fallback={16} savedValue={saved.paddingX as number} className={numberInputClass} />
      </Field>
      <Field label="Padding Y">
        <NumberInput value={data.paddingY as number} onChange={(v) => updateNodeData(id, { paddingY: v })} min={0} fallback={12} savedValue={saved.paddingY as number} className={numberInputClass} />
      </Field>
      <Field label="Shape">
        <NodeSelect value={shape} options={BOX_SHAPE_IDS} onChange={(next) => updateNodeData(id, { shape: next })} />
      </Field>
      {shape === 'rectangle' && (
        <Field label="Radius">
          <NumberInput value={data.borderRadius as number} onChange={(v) => updateNodeData(id, { borderRadius: v })} min={0} fallback={10} savedValue={saved.borderRadius as number} className={numberInputClass} />
        </Field>
      )}
      {(shape === 'hexagon' || shape === 'diamond') && (
        <p className="text-[11px] text-muted-foreground leading-snug w-40">Border follows the original rectangle, not the clipped outline.</p>
      )}
      <Field label="Border">
        <Checkbox
          checked={borderEnabled}
          onCheckedChange={(checked) => updateNodeData(id, { borderEnabled: !!checked })}
          className="nodrag"
        />
      </Field>
      {borderEnabled && (
        <>
          <Field label="Border width">
            <NumberInput value={data.borderWidth as number} onChange={(v) => updateNodeData(id, { borderWidth: v })} min={0} fallback={2} savedValue={saved.borderWidth as number} className={numberInputClass} />
          </Field>
          <Field label="Border color">
            <ColorPicker value={(data.borderColor as string) || '#ffffff'} onChange={(val) => updateNodeData(id, { borderColor: val })} />
          </Field>
        </>
      )}
    </BaseNode>
  )
}
