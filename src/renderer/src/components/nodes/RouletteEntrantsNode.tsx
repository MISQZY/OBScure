import React, { useRef } from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { Checkbox } from '@/components/ui/checkbox'
import { useI18n } from '@/providers/I18nProvider'

import { ROULETTE_ENTRANTS_SOCKETS, ROULETTE_ENTRANTS_OUTPUTS } from './constants'
import { BaseNode, Field, NodeSelect, PlaceholderPicker, textInputClass } from './utils'

/** {name}/{chance}/{weight} — the only tokens a Roulette Entrants row template understands. Always offered regardless of wiring (unlike PlaceholderPicker's usual useAvailablePlaceholders-gated lists) — they're this node's own intrinsic vocabulary, not something that only sometimes resolves. */
const ROULETTE_ENTRANT_ROW_TOKENS = ['name', 'chance', 'weight'] as const

/**
 * A live entrants list — same "auto-created alongside its Roulette" family
 * as the Widget (see addNode's own doc comment in hooks/useSceneGraph.ts),
 * but an ordinary, optional, freely deletable DATA node instead of a
 * mandatory structural one: delete it any time without affecting the
 * Roulette or its Widget (deleting the Roulette still cascades to remove
 * it, same as the Widget). Doesn't render anything of its own — wire its
 * Content output into a Text node's own Content socket to REPLACE that
 * Text's template with this list's formatted rows (see
 * ROULETTE_ENTRANTS_OUTPUTS' own doc comment in constants.ts) — that Text's
 * textarea goes read-only while connected, and Color/Size/Font/Align/...
 * all stay that Text's own normal fields; only the per-row FORMATTING
 * decisions live here.
 *
 * `rowTemplate` formats EACH entrant (see rouletteEntrantRows in
 * overlays/sceneUtils.tsx / its own port in overlays/custom.html) — {name},
 * {chance} (weighted win %, 0-100), {weight} (raw entry count). `layout`
 * decides how the formatted rows join: one per line ('list', the default),
 * or joined by `separator` on one line ('inline', e.g. "Alice, Bob, Carla").
 */
export function RouletteEntrantsNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const { t } = useI18n()
  const templateRef = useRef<HTMLInputElement>(null)
  const rowTemplate = (data.rowTemplate as string) ?? '{name}'
  const layout = (data.layout as string) || 'list'
  const sortByChance = Boolean(data.sortByChance)

  const insertToken = (token: string): void => {
    const el = templateRef.current
    const wrapped = `{${token}}`
    const start = el?.selectionStart ?? rowTemplate.length
    const end = el?.selectionEnd ?? rowTemplate.length
    const next = rowTemplate.slice(0, start) + wrapped + rowTemplate.slice(end)
    updateNodeData(id, { rowTemplate: next })
    requestAnimationFrame(() => {
      const caret = start + wrapped.length
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  return (
    <BaseNode
      id={id}
      data={data}
      title="Roulette Entrants"
      category="data"
      sockets={ROULETTE_ENTRANTS_SOCKETS}
      outputSockets={ROULETTE_ENTRANTS_OUTPUTS}
      help={t.sceneBuilder.tooltip.nodes.rouletteEntrants}
    >
      <div className="flex flex-col gap-1 text-xs">
        <label>Row template</label>
        <div className="flex items-center gap-1">
          <input
            ref={templateRef}
            type="text"
            value={rowTemplate}
            onChange={(e) => updateNodeData(id, { rowTemplate: e.target.value })}
            className={textInputClass}
          />
          <PlaceholderPicker tokens={ROULETTE_ENTRANT_ROW_TOKENS} onInsert={insertToken} />
        </div>
      </div>
      <Field label="Layout">
        <NodeSelect value={layout} options={['list', 'inline']} onChange={(next) => updateNodeData(id, { layout: next })} />
      </Field>
      {layout === 'inline' && (
        <Field label="Separator">
          <input
            type="text"
            value={(data.separator as string) ?? ', '}
            onChange={(e) => updateNodeData(id, { separator: e.target.value })}
            className={textInputClass}
          />
        </Field>
      )}
      <Field label="Sort by chance">
        <Checkbox checked={sortByChance} onCheckedChange={(checked) => updateNodeData(id, { sortByChance: !!checked })} className="nodrag" />
      </Field>
    </BaseNode>
  )
}
