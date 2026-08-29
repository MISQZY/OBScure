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
 * TWO output wires for the Now Playing feed (Spotify/Windows Media — see
 * NowPlayingPayload), each usable for more than one purpose depending on
 * where it lands — any subset can be wired in, or neither:
 *
 * 1. Content (AUDIO_PLAYER_OUTPUTS) wired straight into a Text/Image's own
 *    Content socket — bundles artist+title+cover in one wire: landing on a
 *    Text supplies the values its {artist}/{title} placeholders resolve to
 *    (see audioContentValues in overlays/custom.html), landing on an Image
 *    replaces it outright with the live album art. Reads the live feed
 *    directly and keeps updating on its own regardless of whether Scene
 *    below is wired in at all — see hasAudioContentDeps in overlays/
 *    custom.html for how a plain always-on scene still gets live refreshes
 *    purely from having this wire.
 * 2. Event wired into Scene's own Event socket (see the `event` entry on
 *    SCENE_SOCKETS above, which accepts 'audioPlayer' alongside 'event' —
 *    the SAME socket a real Event node uses) — a visibility-only concern:
 *    marks the whole scene as continuously data-driven instead of one-shot
 *    event-triggered, showing for as long as isPlaying stays true with no
 *    Timer/durationMs. Mirrors isAudioTrigger/showAudioContent in
 *    overlays/custom.html. Doing this ALSO arms {title}/{artist}
 *    placeholders scene-wide and an empty-URL Image's live-album-art
 *    fallback, same as before Content sockets existed — but if you only
 *    want live text/cover on specific nodes with no auto show/hide, skip
 *    this and just use the Content wire above. Being single-value like
 *    everywhere else a socket isn't `multi`, it can't ALSO have a real
 *    Event node wired in at the same time — wiring one replaces the other.
 * 3. Event ALSO wired into a Start node (see the `event` entry on
 *    START_SOCKETS above, which accepts 'audioPlayer' alongside 'event') —
 *    arms the SAME Start->Task->...->End process an Event node would, but
 *    the trigger is "the track changed" rather than a matching alert type
 *    (see processTrigger's audioArmed in overlays/custom.html). Lets a
 *    process play some animation/sound/update every time a new song starts,
 *    same as it would for a donation/follow/etc. Event can reach Scene AND
 *    Start at once — one output, two simultaneous wires (they're
 *    independent sockets on independent nodes, each still single-value on
 *    its own).
 */
export function AudioPlayerNode({ id, data }: NodeProps) {
  return (
    <BaseNode
      id={id}
      data={data}
      title="Audio Player"
      category="data"
      outputSockets={AUDIO_PLAYER_OUTPUTS}
      help="Live now-playing data from Spotify or Windows Media. See each output's own ? for exactly what it does and where to wire it."
    />
  )
}
