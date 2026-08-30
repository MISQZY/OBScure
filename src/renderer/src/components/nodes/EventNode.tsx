import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { ALERT_PLATFORMS, ALERT_TYPES_BY_PLATFORM, type AlertType } from '@shared/types'
import { useIntegrationsStatus } from '@/hooks/use-integration-status'

import { BaseNode, Field, NodeSelect, textInputClass, EVENT_KINDS, ALERT_PLATFORM_LABELS, inferAlertPlatform } from './utils'

export function EventNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const kind = (data.kind as string) || 'alert'
  const statusMap = useIntegrationsStatus()
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
        <div className="flex flex-col gap-1 text-xs">
          <label>Command</label>
          <input
            type="text"
            placeholder="roulette"
            value={(data.command as string) || ''}
            onChange={(e) => updateNodeData(id, { command: e.target.value })}
            className={textInputClass}
          />
          <p className="text-[11px] text-amber-500 leading-snug w-40">SOON — not wired into a live trigger yet.</p>
        </div>
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
