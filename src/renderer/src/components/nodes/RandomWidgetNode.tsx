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
  TEXT_OUTPUTS, IMAGE_OUTPUTS, VIDEO_OUTPUTS, BOX_OUTPUTS, AUDIO_PLAYER_OUTPUTS, RANDOM_WIDGET_SOCKETS, RANDOM_WIDGET_OUTPUTS,
} from './constants'
import {
  useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, NodeSelect, PlaceholderPicker,
  numberInputClass, textInputClass, textAreaClass, selectClass,
  SYSTEM_DEFAULT_FONT, TEXT_ALIGN_BUTTONS, TEXT_VERTICAL_BUTTONS, IconToggleGroup, UploadRow,
  ANIMATION_SUB_TYPES, BOX_SHAPE_IDS, EVENT_KINDS, ALERT_PLATFORM_LABELS, inferAlertPlatform, TASK_ACTIONS,
  useHasIncomingEdge, useAvailablePlaceholders
} from './utils'

/**
 * The actual on-screen rolling numbers — always created and permanently
 * paired with exactly one Random node the moment that's placed (never
 * offered in the Add Node palette on its own — see addNode's own doc
 * comment in hooks/useSceneGraph.ts). Its own `source` socket carries that
 * pairing edge and can't be repointed at a different Random or disconnected
 * (useSceneGraph's onNodesChange/onEdgesChange refuse to let either half of
 * the pair, or the edge between them, be removed alone — deleting one takes
 * the other with it). A plain content node otherwise — same Transform/Style
 * sockets and Structural/Target outputs as Text/Image/Video/Box, so it can
 * be positioned, sized, animated, or handed to a Task exactly like any of
 * those.
 *
 * Shows UNCONDITIONALLY by default once wired into Scene/a Shape, same as
 * any other content node — its own `visible` socket is optional: leave it
 * unwired and the numbers just always render (empty/idle otherwise), or wire
 * the SAME Random's Event output into it to instead hide this SPECIFIC
 * widget outside an active roll (phase 'idle'). Deliberately per-widget, not
 * scene-wide — Event wired into a Start node arms a PROCESS on commit
 * instead (a completely separate concern from this widget's own visibility;
 * see RANDOM_OUTPUTS' own doc comment in constants.ts).
 *
 * `deletable={false}`: no Trash2 button or Duplicate/Delete context-menu
 * entries of its OWN — the pairing is mandatory in this direction, so the
 * only way this node goes away is by deleting its Random (which cascades to
 * it — see onNodesChange in hooks/useSceneGraph.ts). Purely a UI-layer
 * restriction — this just removes the confusing "delete just the widget,
 * leaving an orphaned Random" affordance. Contrast with Roulette Widget's
 * own sibling Entrants node (see RouletteEntrantsNode.tsx), which keeps its
 * own delete button — Random has no node like it (see RANDOM_OUTPUTS' own
 * doc comment in constants.ts for why).
 */
export function RandomWidgetNode({ id, data }: NodeProps) {
  return (
    <BaseNode
      id={id}
      data={data}
      title="Random Widget"
      category="content"
      deletable={false}
      sockets={RANDOM_WIDGET_SOCKETS}
      outputSockets={RANDOM_WIDGET_OUTPUTS}
      help="The rolling numbers — always paired 1:1 with its own Random node. Shows unconditionally unless you wire that Random's own Event output into this node's own Visibility socket. Delete its Random to remove both together."
    />
  )
}
