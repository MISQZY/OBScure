import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { ALERT_PLATFORMS, ALERT_TYPES_BY_PLATFORM, type AlertType } from '@shared/types'
import { useIntegrationsStatus } from '@/hooks/use-integration-status'
import { useCommands } from '@/providers/CommandsProvider'

import { BaseNode, Field, NodeSelect, EVENT_KINDS, ALERT_PLATFORM_LABELS, inferAlertPlatform } from './utils'

const NONE_COMMAND = '__none__'

export function EventNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const kind = (data.kind as string) || 'alert'
  const statusMap = useIntegrationsStatus()
  const { commands } = useCommands()
  const commandId = (data.commandId as string) || ''
  const selectedCommand = commands.find((c) => c.id === commandId)
  // Only a connected integration can actually deliver an alert, so Type only
  // ever offers platforms with status 'connected' (see IntegrationStatus in
  // main/integrations/types.ts) — an unconnected platform doesn't appear as
  // an option at all rather than showing disabled.
  const connectedPlatforms = ALERT_PLATFORMS.filter((p) => statusMap?.[p] === 'connected')
  const savedPlatform = inferAlertPlatform(data)
  const platform = connectedPlatforms.includes(savedPlatform) ? savedPlatform : connectedPlatforms[0]
  const typesForPlatform = platform ? ALERT_TYPES_BY_PLATFORM[platform] : []
  const alertType = platform && typesForPlatform.includes(data.alertType as AlertType) ? (data.alertType as string) : typesForPlatform[0]
  return (
    <BaseNode id={id} data={data} title="Event" category="data">
      <Field label="Kind">
        <NodeSelect
          value={kind}
          options={EVENT_KINDS}
          onChange={(next) => updateNodeData(id, { kind: next })}
        />
      </Field>
      {kind === 'command' ? (
        <>
          <Field label="Command">
            <NodeSelect
              value={selectedCommand ? commandId : NONE_COMMAND}
              options={[NONE_COMMAND, ...commands.map((c) => c.id)]}
              onChange={(next) => updateNodeData(id, { commandId: next === NONE_COMMAND ? null : next })}
              renderOption={(opt) => (opt === NONE_COMMAND ? 'Select...' : (commands.find((c) => c.id === opt)?.name ?? opt))}
            />
          </Field>
          {commands.length === 0 && (
            <p className="text-[11px] text-amber-500 leading-snug w-40">No commands registered yet — add one on the Команды page.</p>
          )}
        </>
      ) : !platform ? (
        <p className="text-[11px] text-amber-500 leading-snug w-40">No connected Twitch/YouTube integration — connect one to pick an alert type.</p>
      ) : (
        <>
          <Field label="Type">
            <NodeSelect
              value={platform}
              options={connectedPlatforms}
              onChange={(next) => updateNodeData(id, { platform: next, alertType: ALERT_TYPES_BY_PLATFORM[next][0] })}
              renderOption={(opt) => ALERT_PLATFORM_LABELS[opt]}
            />
          </Field>
          <Field label="Sub-type">
            <NodeSelect
              value={alertType}
              options={typesForPlatform}
              onChange={(next) => updateNodeData(id, { alertType: next })}
            />
          </Field>
        </>
      )}
    </BaseNode>
  )
}
