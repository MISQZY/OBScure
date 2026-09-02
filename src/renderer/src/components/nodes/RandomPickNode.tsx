import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { Checkbox } from '@/components/ui/checkbox'

import { useI18n } from '@/providers/I18nProvider'
import { useConnectedVariants, BaseNode, Field, NumberInput, numberInputClass } from './utils'

/** Short, human-readable label for one connected variant row — same idea as a Task's own Target row, just cosmetic (nothing here is stored or read back). */
function describeVariant(node: { type?: string; data: Record<string, unknown> }): string {
  switch (node.type) {
    case 'text': {
      const text = (node.data.text as string)?.trim()
      return text ? `Text: ${text.length > 24 ? `${text.slice(0, 24)}…` : text}` : 'Text'
    }
    case 'image':
      return 'Image'
    case 'video':
      return 'Video'
    case 'box':
      return 'Shape'
    case 'group':
      return 'Group'
    case 'randomPick':
      return 'Random Pick'
    case 'rouletteWidget':
      return 'Roulette Wheel'
    case 'randomWidget':
      return 'Random Widget'
    default:
      return node.type || 'Option'
  }
}

/**
 * Resolves to exactly ONE of its wired Options at render time (see
 * pickRandomVariant/RandomPickView) — a router for the content/composition
 * graph, not a container: it carries no Transform/Style of its own, and the
 * chosen variant keeps its own normal wiring untouched, exactly as if it
 * had been wired in directly. `customChance` off (default): every connected
 * Option has an equal shot. On: each gets its own editable weight (default
 * 1, same convention as an unset Roulette entrant's own weight) and the
 * computed % updates live as weights change, same "weight → percentage"
 * formula rouletteEntrantRows already uses.
 */
export function RandomPickNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const { t } = useI18n()
  const variants = useConnectedVariants(id)
  const customChance = Boolean(data.customChance)
  const weights = (data.weights as Record<string, number>) || {}

  const weightOf = (variantId: string): number => {
    const raw = weights[variantId]
    return typeof raw === 'number' && raw >= 0 ? raw : 1
  }
  const totalWeight = variants.reduce((sum, v) => sum + weightOf(v.id), 0)

  const setWeight = (variantId: string, value: number | null): void => {
    updateNodeData(id, { weights: { ...weights, [variantId]: value ?? 1 } })
  }

  return (
    <BaseNode id={id} data={data} title="Random Pick" category="content" help={t.sceneBuilder.tooltip.nodes.randomPick}>
      <Field label="Custom chance">
        <Checkbox checked={customChance} onCheckedChange={(checked) => updateNodeData(id, { customChance: !!checked })} className="nodrag" />
      </Field>
      {customChance &&
        (variants.length === 0 ? (
          <p className="text-[11px] text-muted-foreground leading-snug w-40">Wire some Options in first, then set each one's weight here.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {variants.map((variant) => (
              <div key={variant.id} className="flex items-center gap-1.5 text-[11px]">
                <span className="truncate flex-1 min-w-0" title={describeVariant(variant)}>
                  {describeVariant(variant)}
                </span>
                <NumberInput value={weightOf(variant.id)} onChange={(v) => setWeight(variant.id, v)} min={0} fallback={1} className={numberInputClass} />
                <span className="text-muted-foreground w-8 text-right shrink-0">{totalWeight > 0 ? Math.round((weightOf(variant.id) / totalWeight) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        ))}
    </BaseNode>
  )
}
