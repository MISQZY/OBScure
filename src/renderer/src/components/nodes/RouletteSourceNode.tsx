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
  TEXT_OUTPUTS, IMAGE_OUTPUTS, VIDEO_OUTPUTS, BOX_OUTPUTS, AUDIO_PLAYER_OUTPUTS, ROULETTE_OUTPUTS,
} from './constants'
import {
  useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, NodeSelect, PlaceholderPicker,
  numberInputClass, textInputClass, textAreaClass, selectClass,
  SYSTEM_DEFAULT_FONT, TEXT_ALIGN_BUTTONS, TEXT_VERTICAL_BUTTONS, IconToggleGroup, UploadRow,
  ANIMATION_SUB_TYPES, BOX_SHAPE_IDS, EVENT_KINDS, ALERT_PLATFORM_LABELS, inferAlertPlatform, TASK_ACTIONS,
  useHasIncomingEdge, useAvailablePlaceholders
} from './utils'

/**
 * Live entrants/phase from the Roulette tool (RouletteEngine, driven by the
 * !roulette chat command / points redemptions / manual entries on the
 * Roulette settings page — see RouletteToolPage.tsx). Placing this ALSO
 * places a permanently-paired Roulette Widget (see addNode's own doc
 * comment in hooks/useSceneGraph.ts) — that's the node you actually wire
 * into Scene to show the wheel; this one stays a pure data/control node,
 * same family as Audio Player/Event. See ROULETTE_OUTPUTS' own doc comment
 * in constants.ts for exactly what each output does and where to wire it;
 * that's also surfaced here as each row's own "?" help.
 */
export function RouletteSourceNode({ id, data }: NodeProps) {
  return (
    <BaseNode
      id={id}
      data={data}
      title="Roulette"
      category="data"
      outputSockets={ROULETTE_OUTPUTS}
      help="Live entrants/phase from the Roulette tool. Auto-paired with its own Roulette Widget — that's the node to wire into Scene. See each output's own ? for exactly what it does and where to wire it."
    />
  )
}
