import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import type { AlertPlatform } from '@shared/types'
import { useGlobalVariables } from '@/providers/GlobalVariablesProvider'
import { useTwitchStats } from '@/providers/TwitchStatsProvider'
import { useIntegrationsStatus } from '@/hooks/use-integration-status'

import {
  useSavedNodeData,
  BaseNode,
  Field,
  NumberInput,
  NodeSelect,
  textInputClass,
  numberInputClass,
  sanitizePlaceholderName,
  VARIABLE_SCOPES,
  PLATFORM_STAT_SOURCES,
  PLATFORM_STAT_IDS,
  PLATFORM_STAT_LABELS,
  ALERT_PLATFORM_LABELS,
  platformStatValue
} from './utils'

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
 * Scope platform: name lives here (same as local), but the VALUE comes live
 * from whichever CONNECTED platform `platform` names instead — the Platform
 * picker only ever offers PLATFORM_STAT_SOURCES ∩ actually-connected right
 * now (useIntegrationsStatus), same reasoning ImageNode's own Content-wire
 * read-only field uses for "don't offer a control that wouldn't do
 * anything." `platformStat` then picks which field of that platform's own
 * feed (Followers/Subscribers/Viewers) — polled every 60s in the main
 * process and pushed here the same live way scope=global's own entries
 * update (see TwitchStatsProvider/platformStatValue) — read-only, there's
 * nothing to type.
 */
export function VariableNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const { variables: globalVariables, saveVariable } = useGlobalVariables()
  const twitchStats = useTwitchStats()
  const integrationsStatus = useIntegrationsStatus()
  const scope = data.scope === 'global' ? 'global' : data.scope === 'platform' ? 'platform' : 'local'
  const globalId = (data.globalId as string) || ''
  const selected = globalVariables.find((v) => v.id === globalId)
  const placeholder = scope === 'global' ? (selected ? sanitizePlaceholderName(selected.name) || null : null) : sanitizePlaceholderName((data.name as string) || '') || null
  const connectedPlatforms = PLATFORM_STAT_SOURCES.filter((p) => integrationsStatus?.[p] === 'connected')
  const platform = (data.platform as AlertPlatform) || 'twitch'
  const platformStat = (data.platformStat as (typeof PLATFORM_STAT_IDS)[number]) || 'followers'

  return (
    <BaseNode id={id} data={data} title="Variable" labelable category="data">
      <Field label="Scope">
        <NodeSelect
          value={scope}
          options={VARIABLE_SCOPES}
          onChange={(next) => updateNodeData(id, { scope: next })}
        />
      </Field>
      {scope === 'local' && (
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
      )}
      {scope === 'global' && (
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
      {scope === 'platform' && (
        <>
          <div className="flex flex-col gap-1 text-xs">
            <label>Placeholder</label>
            <input
              type="text"
              placeholder="followers"
              value={(data.name as string) || ''}
              onChange={(e) => updateNodeData(id, { name: sanitizePlaceholderName(e.target.value) })}
              className={textInputClass}
            />
          </div>
          {connectedPlatforms.length > 0 && (
            <Field label="Platform">
              <NodeSelect
                value={connectedPlatforms.includes(platform) ? platform : connectedPlatforms[0]}
                options={connectedPlatforms}
                onChange={(next) => updateNodeData(id, { platform: next })}
                renderOption={(opt) => ALERT_PLATFORM_LABELS[opt]}
              />
            </Field>
          )}
          <Field label="Stat">
            <NodeSelect value={platformStat} options={PLATFORM_STAT_IDS} onChange={(next) => updateNodeData(id, { platformStat: next })} renderOption={(opt) => PLATFORM_STAT_LABELS[opt]} />
          </Field>
          <Field label="Value">
            <span className="text-xs tabular-nums text-muted-foreground">{platformStatValue(platform, platformStat, twitchStats).toLocaleString()}</span>
          </Field>
          {connectedPlatforms.length === 0 && (
            <p className="text-[11px] text-amber-500 leading-snug w-40">No connected platform provides a live stat yet — connect Twitch on the Integrations page.</p>
          )}
        </>
      )}
      <p className="text-[11px] text-muted-foreground leading-snug w-40">{placeholder ? `Placeholder: {${placeholder}}` : 'Set a name to get a {placeholder}.'}</p>
    </BaseNode>
  )
}
