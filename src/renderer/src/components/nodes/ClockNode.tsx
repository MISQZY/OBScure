import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { cn } from '@/lib/utils'

import { useI18n } from '@/providers/I18nProvider'
import { CLOCK_OUTPUTS } from './constants'
import { BaseNode, textInputClass, CLOCK_FORMAT_TOKENS, isValidClockFormat } from './utils'

/**
 * A live `{time}` placeholder in the picked format — no visual presence of
 * its own anymore (see CLOCK_OUTPUTS' own doc comment): wire its Content
 * output into a Text node's own Content socket and style THAT node instead,
 * same "this node only supplies a value, the receiving Text decides how it
 * looks" split Audio Player's own Content wire already uses for
 * {artist}/{title}.
 *
 * Format is free text (see isValidClockFormat/formatClockDate) rather than a
 * fixed dropdown — YYYY/MM/DD/HH/hh/mm/ss/A are the only tokens actually
 * substituted, everything else (colons, dots, labels) passes through
 * literally, so any shape ("HH:mm:ss", "DD.MM.YYYY HH:mm", "'Time:' HH:mm")
 * is just typed directly.
 */
export function ClockNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const { t } = useI18n()
  const format = (data.format as string) ?? ''
  const valid = isValidClockFormat(format)
  return (
    <BaseNode
      id={id}
      data={data}
      title="Clock"
      category="data"
      outputSockets={CLOCK_OUTPUTS}
      help={t.sceneBuilder.tooltip.nodes.clock}
    >
      <div className="flex flex-col gap-1 text-xs">
        <label>Format</label>
        <input
          type="text"
          placeholder="HH:mm:ss"
          value={format}
          onChange={(e) => updateNodeData(id, { format: e.target.value })}
          className={cn(textInputClass, !valid && 'text-destructive outline-destructive/60')}
        />
        {!valid && <p className="text-[11px] text-destructive leading-snug w-40">No recognized token — the clock won't show a live time. Use {CLOCK_FORMAT_TOKENS.join(', ')}.</p>}
      </div>
    </BaseNode>
  )
}
