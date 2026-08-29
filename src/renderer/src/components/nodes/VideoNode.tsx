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

/**
 * A short video clip (URL only — no upload, unlike Image/Sound; point it at
 * a file already reachable over HTTP) — for reaction gifs-as-video/animated
 * logos/meme clips in an alert, which Image/Lottie-less Animation can't
 * cover. Muted by default: browsers block unmuted autoplay outright, and
 * OBS's embedded Browser Source is no exception — a Sound node wired
 * alongside it is the reliable way to get audio out of an alert anyway (see
 * SoundNode). Connect into a Box/Group or straight into Scene, same as Image.
 */
export function VideoNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  const muted = data.muted !== false
  const loop = data.loop !== false
  const borderEnabled = Boolean(data.borderEnabled)
  return (
    <BaseNode
      id={id}
      data={data}
      title="Video"
      labelable
      category="content"
      sockets={VIDEO_SOCKETS}
      outputSockets={VIDEO_OUTPUTS}
      help="Defaults to 320×180 — wire a Size node to override."
    >
      <div className="flex flex-col gap-1 text-xs">
        <label>Video URL</label>
        <input
          type="text"
          placeholder="https://…/clip.mp4"
          value={(data.src as string) || ''}
          onChange={(e) => updateNodeData(id, { src: e.target.value })}
          className={textInputClass}
        />
      </div>
      <Field label="Radius">
        <NumberInput value={data.borderRadius as number} onChange={(v) => updateNodeData(id, { borderRadius: v })} min={0} fallback={8} savedValue={saved.borderRadius as number} className={numberInputClass} />
      </Field>
      <Field label="Loop">
        <Checkbox checked={loop} onCheckedChange={(checked) => updateNodeData(id, { loop: !!checked })} className="nodrag" />
      </Field>
      <Field label="Muted">
        <Checkbox checked={muted} onCheckedChange={(checked) => updateNodeData(id, { muted: !!checked })} className="nodrag" title="Off relies on OBS/the browser allowing autoplaying audio — not guaranteed. Pair with a Sound node for reliable audio instead." />
      </Field>
      <Field label="Border">
        <Checkbox checked={borderEnabled} onCheckedChange={(checked) => updateNodeData(id, { borderEnabled: !!checked })} className="nodrag" />
      </Field>
      {borderEnabled && (
        <>
          <Field label="Border width">
            <NumberInput value={data.borderWidth as number} onChange={(v) => updateNodeData(id, { borderWidth: v })} min={0} fallback={2} savedValue={saved.borderWidth as number} className={numberInputClass} />
          </Field>
          <Field label="Border color">
            <ColorPicker value={(data.borderColor as string) || '#ffffff'} onChange={(val) => updateNodeData(id, { borderColor: val })} />
          </Field>
        </>
      )}
    </BaseNode>
  )
}
