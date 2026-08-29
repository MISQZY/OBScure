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

/** Alert sound + volume — see SoundId. Connect into Scene to say this scene plays a sound. Custom uploaded sounds aren't picked from here; choose a bundled preset or none. */
export function SoundNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const [uploading, setUploading] = useState(false)
  const soundId = (data.soundId as string) || 'none'
  const customSoundName = (data.customSoundName as string) || null

  const upload = async (): Promise<void> => {
    setUploading(true)
    try {
      const result = await window.maddoner.uploadCustomSound(customSoundName)
      if (result) updateNodeData(id, { soundId: 'custom', customSoundName: result.fileName })
    } finally {
      setUploading(false)
    }
  }

  const removeCustom = async (): Promise<void> => {
    if (!customSoundName) return
    await window.maddoner.removeCustomSound(customSoundName)
    updateNodeData(id, { soundId: 'none', customSoundName: null })
  }

  return (
    <BaseNode id={id} data={data} title="Sound" category="data">
      <Field label="Sound">
        <NodeSelect
          value={soundId}
          // 'custom' only appears once there's actually an uploaded file to
          // select — same convention as AlertSoundPicker's Select
          // (components/AlertSoundPicker.tsx), so it can't be picked before
          // one exists.
          options={customSoundName ? SOUND_IDS : SOUND_IDS.filter((sid) => sid !== 'custom')}
          onChange={(next) => updateNodeData(id, { soundId: next })}
          renderOption={(opt) => (opt === 'custom' ? 'custom' : opt)}
        />
      </Field>
      {/* Persists in the app's own writable custom-sounds directory (see
          main/index.ts) until Remove, independent of this node/scene — a
          distinct file per upload (this node's own, not shared with
          AlertSoundPicker's custom-sound slot elsewhere in the app, even
          though both write into the same directory). */}
      <UploadRow uploading={uploading} hasCustom={Boolean(customSoundName)} onUpload={() => void upload()} onRemove={() => void removeCustom()} label={customSoundName ? 'Replace' : 'Upload'} />
      <Field label="Volume">
        <input type="range" min="0" max="1" step="0.05" value={data.volume as number ?? 1} onChange={(e) => updateNodeData(id, { volume: Number(e.target.value) })} className="nodrag w-24" />
      </Field>
    </BaseNode>
  )
}
