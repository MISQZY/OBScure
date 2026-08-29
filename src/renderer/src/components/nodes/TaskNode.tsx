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
 * One step in a Process: shows, hides, or updates ONE component — whichever
 * Text/Image/Box is wired into this Task's own Target socket (see
 * TASK_SOCKETS above). Animation/Position/Size/Transform each get their own
 * dedicated socket too, instead of piling onto Target (an Animation on a
 * Show/Hide plays as the entrance/exit; on Update it's ignored — Update
 * only ever changes Position/Size/Transform without touching visibility).
 * Its output is the next sequence-flow step — another Task, a Wait, or End.
 */
export function TaskNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  return (
    <BaseNode
      id={id}
      data={data}
      title="Task"
      labelable
      category="process"
      sockets={TASK_SOCKETS}
      sequenceIn
      help="Wire the Target this step acts on, plus any modifiers into their own sockets. Sound needs a Target wired too (even an otherwise-inert Update step) — it's what anchors the sound to this moment."
    >
      <Field label="Action">
        <NodeSelect
          value={(data.action as string) || 'show'}
          options={TASK_ACTIONS}
          onChange={(next) => updateNodeData(id, { action: next })}
        />
      </Field>
    </BaseNode>
  )
}
