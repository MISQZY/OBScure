import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { BarChart3, Activity, Circle, type LucideIcon } from 'lucide-react'

import { useI18n } from '@/providers/I18nProvider'
import { EQUALIZER_SOCKETS, EQUALIZER_OUTPUTS } from './constants'
import { useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, RadiusField, IconToggleGroup, numberInputClass } from './utils'

const EQUALIZER_STYLE_BUTTONS: readonly { id: 'bar' | 'wave' | 'dot'; Icon: LucideIcon; title: string }[] = [
  { id: 'bar', Icon: BarChart3, title: 'Bars' },
  { id: 'wave', Icon: Activity, title: 'Wave' },
  { id: 'dot', Icon: Circle, title: 'Dots' }
] as const

/**
 * A bar/wave/dot audio visualizer. Wire an Audio Source node into its own
 * Source socket to say which capture device drives it — real capture
 * happens in the Electron app itself, not this node (see AudioSourceNode's
 * own doc comment), so nothing here reads live audio: the fields below are
 * purely this visual's own look. The in-editor preview (EqualizerView.tsx)
 * is a decorative approximation for exactly that reason — see its own doc
 * comment.
 */
export function EqualizerNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const { t } = useI18n()
  const saved = useSavedNodeData(id)
  const styleType = (data.style as string) === 'wave' || (data.style as string) === 'dot' ? (data.style as 'wave' | 'dot') : 'bar'
  return (
    <BaseNode
      id={id}
      data={data}
      title="Equalizer"
      labelable
      category="content"
      sockets={EQUALIZER_SOCKETS}
      outputSockets={EQUALIZER_OUTPUTS}
      help={t.sceneBuilder.tooltip.nodes.equalizer}
    >
      <Field label="Style">
        <IconToggleGroup value={styleType} options={EQUALIZER_STYLE_BUTTONS} onChange={(next) => updateNodeData(id, { style: next })} />
      </Field>
      <Field label="Bars">
        <NumberInput
          value={data.barCount as number}
          onChange={(v) => updateNodeData(id, { barCount: v })}
          min={2}
          max={96}
          fallback={24}
          savedValue={saved.barCount as number}
          className={numberInputClass}
        />
      </Field>
      <Field label="Color">
        <ColorPicker
          value={(data.color as string) || '#8b5cf6'}
          onChange={(val) => updateNodeData(id, { color: val })}
          gradientMeta={data.colorGradientMeta as string}
          onGradientMetaChange={(meta) => updateNodeData(id, { colorGradientMeta: meta })}
        />
      </Field>
      <Field label="Speed">
        <NumberInput
          value={data.speed as number}
          onChange={(v) => updateNodeData(id, { speed: v })}
          min={0.1}
          max={5}
          step={0.1}
          fallback={1}
          savedValue={saved.speed as number}
          className={numberInputClass}
        />
      </Field>
      <Field label="Intensity">
        <NumberInput
          value={data.intensity as number}
          onChange={(v) => updateNodeData(id, { intensity: v })}
          min={0.1}
          max={3}
          step={0.1}
          fallback={1}
          savedValue={saved.intensity as number}
          className={numberInputClass}
        />
      </Field>
      <Field label="Width">
        <NumberInput value={data.width as number} onChange={(v) => updateNodeData(id, { width: v })} min={16} fallback={240} savedValue={saved.width as number} className={numberInputClass} />
      </Field>
      <Field label="Height">
        <NumberInput value={data.height as number} onChange={(v) => updateNodeData(id, { height: v })} min={16} fallback={80} savedValue={saved.height as number} className={numberInputClass} />
      </Field>
      <RadiusField id={id} data={data} saved={saved} fallback={8} />
    </BaseNode>
  )
}
