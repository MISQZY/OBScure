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
  TEXT_OUTPUTS, IMAGE_OUTPUTS, VIDEO_OUTPUTS, BOX_OUTPUTS, AUDIO_PLAYER_OUTPUTS, ROULETTE_ENTRANTS_SOCKETS, ROULETTE_ENTRANTS_OUTPUTS,
} from './constants'
import {
  useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, NodeSelect, PlaceholderPicker,
  numberInputClass, textInputClass, textAreaClass, selectClass,
  SYSTEM_DEFAULT_FONT, TEXT_ALIGN_BUTTONS, TEXT_VERTICAL_BUTTONS, IconToggleGroup, UploadRow,
  ANIMATION_SUB_TYPES, BOX_SHAPE_IDS, EVENT_KINDS, ALERT_PLATFORM_LABELS, inferAlertPlatform, TASK_ACTIONS,
  useHasIncomingEdge, useAvailablePlaceholders
} from './utils'

/** {name}/{chance}/{weight} — the only tokens a Roulette Entrants row template understands. Always offered regardless of wiring (unlike PlaceholderPicker's usual useAvailablePlaceholders-gated lists) — they're this node's own intrinsic vocabulary, not something that only sometimes resolves. */
const ROULETTE_ENTRANT_ROW_TOKENS = ['name', 'chance', 'weight'] as const

/**
 * A live entrants list — same "auto-created alongside its Roulette" family
 * as the Widget (see addNode's own doc comment in hooks/useSceneGraph.ts),
 * but an ordinary, optional, freely deletable DATA node instead of a
 * mandatory structural one: delete it any time without affecting the
 * Roulette or its Widget (deleting the Roulette still cascades to remove
 * it, same as the Widget). Doesn't render anything of its own — wire its
 * Content output into a Text node's own Content socket to REPLACE that
 * Text's template with this list's formatted rows (see
 * ROULETTE_ENTRANTS_OUTPUTS' own doc comment in constants.ts) — that Text's
 * textarea goes read-only while connected, and Color/Size/Font/Align/...
 * all stay that Text's own normal fields; only the per-row FORMATTING
 * decisions live here.
 *
 * `rowTemplate` formats EACH entrant (see rouletteEntrantRows in
 * overlays/sceneUtils.tsx / its own port in overlays/custom.html) — {name},
 * {chance} (weighted win %, 0-100), {weight} (raw entry count). `layout`
 * decides how the formatted rows join: one per line ('list', the default),
 * or joined by `separator` on one line ('inline', e.g. "Alice, Bob, Carla").
 */
export function RouletteEntrantsNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const templateRef = useRef<HTMLInputElement>(null)
  const rowTemplate = (data.rowTemplate as string) ?? '{name}'
  const layout = (data.layout as string) || 'list'
  const sortByChance = Boolean(data.sortByChance)

  const insertToken = (token: string): void => {
    const el = templateRef.current
    const wrapped = `{${token}}`
    const start = el?.selectionStart ?? rowTemplate.length
    const end = el?.selectionEnd ?? rowTemplate.length
    const next = rowTemplate.slice(0, start) + wrapped + rowTemplate.slice(end)
    updateNodeData(id, { rowTemplate: next })
    requestAnimationFrame(() => {
      const caret = start + wrapped.length
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  return (
    <BaseNode
      id={id}
      data={data}
      title="Roulette Entrants"
      category="data"
      sockets={ROULETTE_ENTRANTS_SOCKETS}
      outputSockets={ROULETTE_ENTRANTS_OUTPUTS}
      help="Formats its paired Roulette's entrants into rows. Wire Content into a Text node's own Content socket to show them there (read-only, replacing that Text's own template) — Color/Size/etc. stay the Text's own fields. Delete freely — unlike the Widget, this one has no lock."
    >
      <div className="flex flex-col gap-1 text-xs">
        <label>Row template</label>
        <div className="flex items-center gap-1">
          <input
            ref={templateRef}
            type="text"
            value={rowTemplate}
            onChange={(e) => updateNodeData(id, { rowTemplate: e.target.value })}
            className={textInputClass}
          />
          <PlaceholderPicker tokens={ROULETTE_ENTRANT_ROW_TOKENS} onInsert={insertToken} />
        </div>
      </div>
      <Field label="Layout">
        <NodeSelect value={layout} options={['list', 'inline']} onChange={(next) => updateNodeData(id, { layout: next })} />
      </Field>
      {layout === 'inline' && (
        <Field label="Separator">
          <input
            type="text"
            value={(data.separator as string) ?? ', '}
            onChange={(e) => updateNodeData(id, { separator: e.target.value })}
            className={textInputClass}
          />
        </Field>
      )}
      <Field label="Sort by chance">
        <Checkbox checked={sortByChance} onCheckedChange={(checked) => updateNodeData(id, { sortByChance: !!checked })} className="nodrag" />
      </Field>
    </BaseNode>
  )
}
