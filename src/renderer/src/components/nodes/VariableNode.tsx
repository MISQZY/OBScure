import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import type { VariableDataType } from '@shared/types'
import { Checkbox, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { useGlobalVariables } from '@/providers/GlobalVariablesProvider'
import { useTwitchStats } from '@/providers/TwitchStatsProvider'
import { useStreamerBotVariables } from '@/providers/StreamerBotVariablesProvider'
import { useIntegrationsStatus } from '@/hooks/use-integration-status'
import { useI18n } from '@/providers/I18nProvider'

import {
  useSavedNodeData,
  BaseNode,
  Field,
  Callout,
  NumberInput,
  NodeSelect,
  textInputClass,
  numberInputClass,
  sanitizePlaceholderName,
  VARIABLE_SCOPES,
  VARIABLE_TYPES,
  VARIABLE_TYPE_LABELS,
  coerceVariableValue,
  VARIABLE_INTEGRATION_SOURCES,
  VARIABLE_INTEGRATION_LABELS,
  PLATFORM_STAT_IDS,
  PLATFORM_STAT_LABELS,
  platformStatValue,
  streamerbotVariableValue,
  type VariableIntegrationSource
} from './utils'

const NONE_STREAMERBOT = '__none__'

const NONE_GLOBAL = '__none__'

/**
 * The Value control for a given VariableDataType — a checkbox for
 * 'boolean', a plain text field for 'string', otherwise NumberInput (with
 * `step`/rounding matching 'int' vs 'float' — see coerceVariableValue's own
 * doc comment for why an 'int' rounds instead of just truncating on
 * display). Shared by both scope='local' (writes straight to this node's
 * own `data.value`) and scope='global' (writes to the selected
 * GlobalVariable instead) below — same type, same editor either way.
 */
function VariableValueField({
  type,
  value,
  onChange,
  savedValue
}: {
  type: VariableDataType
  value: unknown
  onChange: (next: string | number | boolean) => void
  savedValue?: number
}) {
  if (type === 'boolean') {
    return <Checkbox checked={!!value} onCheckedChange={(checked) => onChange(!!checked)} className="nodrag" />
  }
  if (type === 'string') {
    return <input type="text" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={textInputClass} />
  }
  return (
    <NumberInput
      value={value as number}
      onChange={(v) => onChange(type === 'int' ? Math.round(v ?? 0) : (v ?? 0))}
      step={type === 'int' ? 1 : 0.1}
      fallback={0}
      savedValue={savedValue}
      className={numberInputClass}
    />
  )
}

/** The "Placeholder" label shared by scope='local'/'integration' name inputs below, with a "?" tooltip explaining what typing a name here actually does — moved out of the node's own body text (see the `placeholder` state's own render below) so a node with no name set yet doesn't need a whole extra line just to explain itself. */
function PlaceholderLabel() {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-1">
      <label>Placeholder</label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="nodrag shrink-0 flex items-center justify-center size-3.5 rounded-full border border-muted-foreground/50 text-muted-foreground text-[9px] font-bold leading-none hover:bg-accent hover:text-accent-foreground hover:border-foreground/50 transition-colors cursor-pointer"
          >
            ?
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="w-56 text-xs leading-snug whitespace-normal">
          {t.sceneBuilder.tooltip.variablePlaceholder}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

/**
 * A single named, typed value (string/boolean/integer/float — see
 * VariableDataType in shared/types.ts), registering `{name}` as a template
 * placeholder any Text node in THIS scene can use (see
 * useAvailablePlaceholders/variablePlaceholderValues) — same mere-presence
 * "registration" as EVENT_PLACEHOLDERS, no wiring required — and wireable
 * into Progress Bar's own Current/Target sockets (see PROGRESS_SOCKETS),
 * which force whatever type this resolves to back to a plain number (see
 * variablePlaceholderNumericValue) since a bar's fill has no meaning for a
 * string/boolean.
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
 * Scope integration: name lives here (same as local), but the VALUE comes
 * live from whichever CONNECTED integration `integration` names instead —
 * the Integration picker only ever offers VARIABLE_INTEGRATION_SOURCES ∩
 * actually-connected right now (useIntegrationsStatus), same reasoning
 * ImageNode's own Content-wire read-only field uses for "don't offer a
 * control that wouldn't do anything." Depending on which integration is
 * picked, either `platformStat` selects a live numeric field (see
 * platformStatValue) or `streamerbotName` selects a live named variable
 * (see streamerbotVariableValue) — either way this is read-only, there's
 * nothing to type.
 */
export function VariableNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const { variables: globalVariables, saveVariable } = useGlobalVariables()
  const twitchStats = useTwitchStats()
  const streamerbotVariables = useStreamerBotVariables()
  const integrationsStatus = useIntegrationsStatus()
  const scope = data.scope === 'global' ? 'global' : data.scope === 'integration' ? 'integration' : 'local'
  const type = (data.type as VariableDataType) || 'float'
  const globalId = (data.globalId as string) || ''
  const selected = globalVariables.find((v) => v.id === globalId)
  const selectedType: VariableDataType = selected?.type || 'float'
  const placeholder = scope === 'global' ? (selected ? sanitizePlaceholderName(selected.name) || null : null) : sanitizePlaceholderName((data.name as string) || '') || null
  const connectedIntegrations = VARIABLE_INTEGRATION_SOURCES.filter((s) => integrationsStatus?.[s] === 'connected')
  const savedIntegration = (data.integration as VariableIntegrationSource) || 'twitch'
  // Falls back to whichever integration IS actually connected when the
  // saved one isn't (e.g. it defaults to 'twitch' but only Streamer.bot is
  // connected) — same correction the picker's own displayed value already
  // made, now applied everywhere else `integration` is read too, so the
  // Variable/Value fields below never render the wrong integration's
  // controls while the picker itself shows the right one.
  const integration = connectedIntegrations.includes(savedIntegration) ? savedIntegration : (connectedIntegrations[0] ?? savedIntegration)
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
            <PlaceholderLabel />
            <input
              type="text"
              placeholder="myVar"
              value={(data.name as string) || ''}
              onChange={(e) => updateNodeData(id, { name: sanitizePlaceholderName(e.target.value) })}
              className={textInputClass}
            />
          </div>
          <Field label="Type">
            <NodeSelect
              value={type}
              options={VARIABLE_TYPES}
              onChange={(next) => updateNodeData(id, { type: next, value: coerceVariableValue(next, data.value) })}
              renderOption={(opt) => VARIABLE_TYPE_LABELS[opt]}
            />
          </Field>
          <Field label="Value">
            <VariableValueField type={type} value={data.value} onChange={(v) => updateNodeData(id, { value: v })} savedValue={saved.value as number} />
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
            <>
              <Field label="Type">
                <NodeSelect
                  value={selectedType}
                  options={VARIABLE_TYPES}
                  onChange={(next) => void saveVariable({ ...selected, type: next, value: coerceVariableValue(next, selected.value) })}
                  renderOption={(opt) => VARIABLE_TYPE_LABELS[opt]}
                />
              </Field>
              <Field label="Value">
                <VariableValueField type={selectedType} value={selected.value} onChange={(v) => void saveVariable({ ...selected, value: v })} />
              </Field>
            </>
          )}
          {globalVariables.length === 0 && (
            <Callout>No global variables registered yet — add one on the Данные → Переменные page.</Callout>
          )}
        </>
      )}
      {scope === 'integration' && (
        <>
          <div className="flex flex-col gap-1 text-xs">
            <PlaceholderLabel />
            <input
              type="text"
              placeholder="myVar"
              value={(data.name as string) || ''}
              onChange={(e) => updateNodeData(id, { name: sanitizePlaceholderName(e.target.value) })}
              className={textInputClass}
            />
          </div>
          {connectedIntegrations.length > 0 && (
            <Field label="Integration">
              <NodeSelect
                value={integration}
                options={connectedIntegrations}
                onChange={(next) => updateNodeData(id, { integration: next })}
                renderOption={(opt) => VARIABLE_INTEGRATION_LABELS[opt]}
              />
            </Field>
          )}
          {connectedIntegrations.length === 0 ? (
            <Callout>No connected integration provides a live value yet — connect one on the Integrations page.</Callout>
          ) : integration === 'streamerbot' ? (
            <>
              <Field label="Variable">
                <NodeSelect
                  value={(data.streamerbotName as string) || NONE_STREAMERBOT}
                  options={[NONE_STREAMERBOT, ...streamerbotVariables.map((v) => v.name)]}
                  onChange={(next) => updateNodeData(id, { streamerbotName: next === NONE_STREAMERBOT ? '' : next })}
                  renderOption={(opt) => (opt === NONE_STREAMERBOT ? 'Select...' : opt)}
                />
              </Field>
              {data.streamerbotName ? (
                <Field label="Value">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {String(streamerbotVariableValue(data.streamerbotName as string, streamerbotVariables))}
                  </span>
                </Field>
              ) : null}
              {streamerbotVariables.length === 0 && (
                <Callout>No variables seen from this integration yet — make sure it has at least one.</Callout>
              )}
            </>
          ) : (
            <>
              <Field label="Variable">
                <NodeSelect value={platformStat} options={PLATFORM_STAT_IDS} onChange={(next) => updateNodeData(id, { platformStat: next })} renderOption={(opt) => PLATFORM_STAT_LABELS[opt]} />
              </Field>
              <Field label="Value">
                <span className="text-xs tabular-nums text-muted-foreground">{platformStatValue(integration, platformStat, twitchStats).toLocaleString()}</span>
              </Field>
            </>
          )}
        </>
      )}
      {placeholder && <p className="text-[11px] text-muted-foreground leading-snug w-40">{`Placeholder: {${placeholder}}`}</p>}
    </BaseNode>
  )
}
