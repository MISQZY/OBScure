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
 * A drop shadow — separate from Text's own old built-in always-on shadow
 * (that field is gone; nothing wired in now means no shadow at all, same
 * "absence = no effect" convention as every other modifier here). Applied
 * as `filter: drop-shadow(...)` rather than text-shadow/box-shadow so ONE
 * implementation works correctly on Text (per-glyph, like text-shadow would)
 * AND on a shaped Box (follows the shape's own clip-path outline, which
 * box-shadow — a plain rectangle unless you hand-sync its radius — would
 * get wrong on a circle/hexagon/diamond Box). See BoxNode's own doc comment
 * for the shape field.
 */
export function ShadowNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const saved = useSavedNodeData(id)
  return (
    <BaseNode id={id} data={data} title="Shadow" category="style">
      <Field label="Color">
        <ColorPicker value={(data.color as string) || '#000000'} onChange={(val) => updateNodeData(id, { color: val })} />
      </Field>
      <Field label="Opacity">
        <input type="range" min="0" max="100" step="1" value={(data.opacity as number) ?? 60} onChange={(e) => updateNodeData(id, { opacity: Number(e.target.value) })} className="nodrag w-24" />
        <span className="text-[10px] text-muted-foreground w-8 text-right shrink-0">{(data.opacity as number) ?? 60}%</span>
      </Field>
      <Field label="Blur">
        <NumberInput value={data.blur as number} onChange={(v) => updateNodeData(id, { blur: v })} min={0} fallback={6} savedValue={saved.blur as number} className={numberInputClass} />
      </Field>
      <Field label="Offset X">
        <NumberInput value={data.offsetX as number} onChange={(v) => updateNodeData(id, { offsetX: v })} fallback={0} savedValue={saved.offsetX as number} className={numberInputClass} />
      </Field>
      <Field label="Offset Y">
        <NumberInput value={data.offsetY as number} onChange={(v) => updateNodeData(id, { offsetY: v })} fallback={2} savedValue={saved.offsetY as number} className={numberInputClass} />
      </Field>
    </BaseNode>
  )
}
