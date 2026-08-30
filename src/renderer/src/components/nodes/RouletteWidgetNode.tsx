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
  TEXT_OUTPUTS, IMAGE_OUTPUTS, VIDEO_OUTPUTS, BOX_OUTPUTS, AUDIO_PLAYER_OUTPUTS, ROULETTE_WIDGET_SOCKETS, ROULETTE_WIDGET_OUTPUTS,
} from './constants'
import {
  useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, NodeSelect, PlaceholderPicker,
  numberInputClass, textInputClass, textAreaClass, selectClass,
  SYSTEM_DEFAULT_FONT, TEXT_ALIGN_BUTTONS, TEXT_VERTICAL_BUTTONS, IconToggleGroup, UploadRow,
  ANIMATION_SUB_TYPES, BOX_SHAPE_IDS, EVENT_KINDS, ALERT_PLATFORM_LABELS, inferAlertPlatform, TASK_ACTIONS,
  useHasIncomingEdge, useAvailablePlaceholders
} from './utils'

/**
 * The actual on-screen spinning wheel — always created and permanently
 * paired with exactly one Roulette node the moment that's placed (never
 * offered in the Add Node palette on its own — see addNode's own doc
 * comment in hooks/useSceneGraph.ts). Its own `source` socket carries that
 * pairing edge and can't be repointed at a different Roulette or
 * disconnected (useSceneGraph's onNodesChange/onEdgesChange refuse to let
 * either half of the pair, or the edge between them, be removed alone —
 * deleting one takes the other with it). A plain content node otherwise —
 * same Transform/Style sockets and Structural/Target outputs as Text/Image/
 * Video/Box, so it can be positioned, sized, animated, or handed to a Task
 * exactly like any of those.
 *
 * Shows UNCONDITIONALLY by default once wired into Scene/a Shape, same as
 * any other content node — its own `visible` socket is optional: leave it
 * unwired and the wheel just always renders; wire the SAME Roulette's Event
 * output into it to instead hide this SPECIFIC widget outside an active
 * round (phase 'idle'). Deliberately per-widget, not scene-wide — Event
 * wired into a Start node arms a PROCESS on round-start instead (a
 * completely separate concern from this widget's own visibility; see
 * ROULETTE_OUTPUTS' own doc comment in constants.ts).
 *
 * `deletable={false}`: no Trash2 button or Duplicate/Delete context-menu
 * entries of its OWN — the pairing is mandatory in this direction, so the
 * only way this node goes away is by deleting its Roulette (which cascades
 * to it — see onNodesChange in hooks/useSceneGraph.ts). Purely a UI-layer
 * restriction — the node itself is still perfectly deletable via that
 * cascade, this just removes the confusing "delete just the widget, leaving
 * an orphaned Roulette" affordance. Contrast with Roulette Entrants (see
 * RouletteEntrantsNode.tsx), which keeps its own delete button.
 */
export function RouletteWidgetNode({ id, data }: NodeProps) {
  return (
    <BaseNode
      id={id}
      data={data}
      title="Roulette Widget"
      category="content"
      deletable={false}
      sockets={ROULETTE_WIDGET_SOCKETS}
      outputSockets={ROULETTE_WIDGET_OUTPUTS}
      help="The actual spinning wheel — always paired 1:1 with its own Roulette node. Shows unconditionally unless you wire that Roulette's own Event output into this node's own Visibility socket. Delete its Roulette to remove both together."
    />
  )
}
