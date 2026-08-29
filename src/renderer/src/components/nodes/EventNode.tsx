import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, NodeProps, useReactFlow, useStore } from '@xyflow/react'
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Bold,
  Italic,
  Upload,
  X,
  type LucideIcon
} from 'lucide-react'
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { ANIMATION_IDS, BACKGROUND_ANIMATION_IDS } from '@shared/overlayConfig'
import { ALERT_PLATFORMS, ALERT_TYPES_BY_PLATFORM, type AlertPlatform, type AlertType } from '@shared/types'
import { SOUND_IDS } from '@shared/sounds'
import { cn } from '@/lib/utils'
import { MBadge } from '@/components/MBadge'
import { Checkbox } from '@/components/ui/checkbox'
import { useSystemFonts } from '@/hooks/use-system-fonts'
import { useIntegrationsStatus } from '@/hooks/use-integration-status'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HexColorPicker, HexColorInput } from 'react-colorful'

import { 
  NodeCategory, InputSocket, OutputSocket,
  TEXT_SOCKETS, IMAGE_SOCKETS, VIDEO_SOCKETS, BOX_SOCKETS, SCENE_SOCKETS, BACKGROUND_FX_SOCKETS, START_SOCKETS, TASK_SOCKETS,
  TEXT_OUTPUTS, IMAGE_OUTPUTS, VIDEO_OUTPUTS, BOX_OUTPUTS, AUDIO_PLAYER_OUTPUTS,
} from './constants'
import {
  useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, NodeSelect, PlaceholderPicker, 
  numberInputClass, textInputClass, textAreaClass, selectClass,
  SYSTEM_DEFAULT_FONT, TEXT_ALIGN_BUTTONS, TEXT_VERTICAL_BUTTONS, IconToggleGroup, UploadRow,
  ANIMATION_SUB_TYPES, BOX_SHAPE_IDS, EVENT_KINDS, ALERT_PLATFORM_LABELS, inferAlertPlatform, TASK_ACTIONS,
  useHasIncomingEdge, useAvailablePlaceholders
} from './utils'

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
