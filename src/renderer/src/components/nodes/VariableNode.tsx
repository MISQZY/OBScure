import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { useGlobalVariables } from '@/providers/GlobalVariablesProvider'

import { useSavedNodeData, BaseNode, Field, NumberInput, NodeSelect, textInputClass, numberInputClass, sanitizePlaceholderName, VARIABLE_SCOPES } from './utils'

const NONE_GLOBAL = '__none__'

/**
 * A single named numeric value, registering `{name}` as a template
 * placeholder any Text node in THIS scene can use (see
 * useAvailablePlaceholders/variablePlaceholderValues) — same mere-presence
 * "registration" as EVENT_PLACEHOLDERS, no wiring required — and wireable
 * into Progress Bar's own Current/Target sockets (see PROGRESS_SOCKETS).
 *
 * Scope local (default): name + value both live here, editable directly —
 * a manual placeholder for wherever a future live-stat feed will land.
 * Scope global: name + value instead come from whichever GlobalVariable
 * `globalId` points at, registered on the "Данные → Переменные" page
 * (GlobalVariablesProvider) — the SAME entry then updates everywhere it's
 * referenced, across every scene, live in an already-open OBS Browser
 * Source too (see OverlayServer.setGlobalVariables). Editing Value here
 * when global writes straight back to that shared entry, same as editing it
 * on the Данные page itself.
 */
export function VariableNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const { variables: globalVariables, saveVariable } = useGlobalVariables()
  const scope = (data.scope as string) === 'global' ? 'global' : 'local'
  const globalId = (data.globalId as string) || ''
  const selected = globalVariables.find((v) => v.id === globalId)
  const placeholder = scope === 'global' ? (selected ? sanitizePlaceholderName(selected.name) || null : null) : sanitizePlaceholderName((data.name as string) || '') || null

  return (
    <BaseNode id={id} data={data} title="Variable" labelable category="data">
      <Field label="Scope">
        <NodeSelect
          value={scope}
          options={VARIABLE_SCOPES}
          onChange={(next) => updateNodeData(id, { scope: next })}
        />
      </Field>
      {scope === 'local' ? (
        <>
          <div className="flex flex-col gap-1 text-xs">
            <label>Placeholder</label>
            <input
              type="text"
              placeholder="myVar"
              value={(data.name as string) || ''}
              onChange={(e) => updateNodeData(id, { name: sanitizePlaceholderName(e.target.value) })}
              className={textInputClass}
            />
          </div>
          <Field label="Value">
            <NumberInput value={data.value as number} onChange={(v) => updateNodeData(id, { value: v })} fallback={0} savedValue={saved.value as number} className={numberInputClass} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Variable">
            <NodeSelect
              value={globalId || NONE_GLOBAL}
              options={[NONE_GLOBAL, ...globalVariables.map((v) => v.id)]}
              onChange={(next) => updateNodeData(id, { globalId: next === NONE_GLOBAL ? null : next })}
              renderOption={(opt) => (opt === NONE_GLOBAL ? 'Select...' : globalVariables.find((v) => v.id === opt)?.name || opt)}
            />
          </Field>
          {selected && (
            <Field label="Value">
              <NumberInput
                value={selected.value}
                onChange={(v) => void saveVariable({ ...selected, value: v ?? 0 })}
                fallback={0}
                className={numberInputClass}
              />
            </Field>
          )}
          {globalVariables.length === 0 && (
            <p className="text-[11px] text-amber-500 leading-snug w-40">No global variables registered yet — add one on the Данные → Переменные page.</p>
          )}
        </>
      )}
      <p className="text-[11px] text-muted-foreground leading-snug w-40">{placeholder ? `Placeholder: {${placeholder}}` : 'Set a name to get a {placeholder}.'}</p>
    </BaseNode>
  )
}
