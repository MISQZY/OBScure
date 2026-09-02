import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { cn } from '@/lib/utils'

import { CLOCK_OUTPUTS } from './constants'
import { BaseNode, textInputClass, CLOCK_FORMAT_PRESETS, CLOCK_FORMAT_TOKENS, isValidClockFormat } from './utils'

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
 * is just typed directly. The preset buttons below are shortcuts, not the
 * only allowed values.
 */
export function ClockNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const format = (data.format as string) ?? ''
  const valid = isValidClockFormat(format)
  return (
    <BaseNode
      id={id}
      data={data}
      title="Clock"
      category="data"
      outputSockets={CLOCK_OUTPUTS}
      help="Wire Content into a Text node's own Content socket and use {time} in its template — that Text's own color/font/size/align apply, not anything here."
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
        <div className="flex flex-wrap gap-1 mt-0.5">
          {CLOCK_FORMAT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => updateNodeData(id, { format: preset })}
              className="nodrag text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-muted hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>
      </div>
    </BaseNode>
  )
}
