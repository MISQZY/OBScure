import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { BACKGROUND_ANIMATION_IDS } from '@shared/overlayConfig'
import { MBadge } from '@/components/MBadge'
import { Checkbox } from '@/components/ui/checkbox'
import { useI18n } from '@/providers/I18nProvider'

import { BACKGROUND_FX_SOCKETS } from './constants'
import { useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, NodeSelect, numberInputClass } from './utils'

/**
 * The full-viewport ambient layer (gradient/pulse/stars/vignette/paratrooper/airdrop)
 * — see BackgroundAnimationId. Category "data" (not "style"): despite the
 * name, this isn't a per-component modifier like Position/Animation/Hide —
 * it doesn't attach to a specific Text/Image/Box the way those do. It's a
 * scene/process-level accessory wired into Start or Scene's own
 * `backgroundFx` socket, the exact same tier as Event/Sound/Timer (all
 * "data" category too) — one config that activates alongside the trigger,
 * not something that reshapes a piece of content. Grouping it with
 * Position/Animation visually implied a relationship it doesn't have.
 *
 * The one thing that DOES make it unusual even among Event/Sound/Timer: it
 * also HAS an input of its own — wire a Text node into it to caption
 * paratrooper's nickname tag / airdrop's crate label with that Text node's
 * content — only its text is used, not its color/alignment, and only for
 * those two Types. See findBackgroundFxLabel in SceneBuilderPage.tsx and
 * the matching lookup in overlays/custom.html's render(), which both walk
 * this same edge.
 */
export function BackgroundAnimationNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const { t } = useI18n()
  const saved = useSavedNodeData(id)
  const type = (data.type as string) || 'none'
  const isDropEffect = type === 'paratrooper' || type === 'airdrop'

  return (
    <BaseNode id={id} data={data} title="Background FX" category="data" sockets={BACKGROUND_FX_SOCKETS}>
      <Field label="Type">
        <NodeSelect
          value={type}
          options={BACKGROUND_ANIMATION_IDS}
          onChange={(next) => updateNodeData(id, { type: next })}
          renderOption={(opt) => (
            <>
              <span className="truncate">{opt}</span>
              {(opt === 'paratrooper' || opt === 'airdrop') && <MBadge className="size-3.5 text-[8px] shrink-0" />}
            </>
          )}
        />
      </Field>
      <Field label="Color">
        <ColorPicker value={(data.color as string) || '#18181b'} onChange={(val) => updateNodeData(id, { color: val })} />
      </Field>
      <Field label="Speed">
        <NumberInput value={data.speed as number} onChange={(v) => updateNodeData(id, { speed: v })} min={0.5} max={2.5} fallback={1} savedValue={saved.speed as number} className={numberInputClass} />
      </Field>
      {isDropEffect && (
        <>
          <Field label="Repeat">
            <Checkbox
              checked={Boolean(data.repeat)}
              onCheckedChange={(checked) => updateNodeData(id, { repeat: !!checked })}
              className="nodrag"
              title={t.sceneBuilder.tooltip.backgroundFxLoop}
            />
          </Field>
          <p className="text-[11px] text-muted-foreground leading-snug w-40">
            Connect a Text node to caption the {type === 'paratrooper' ? 'nickname tag' : 'crate label'}.
          </p>
        </>
      )}
    </BaseNode>
  )
}
