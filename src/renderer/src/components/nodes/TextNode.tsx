import React, { useRef } from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { Bold, Italic } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSystemFonts } from '@/hooks/use-system-fonts'
import { useI18n } from '@/providers/I18nProvider'
import { useGlobalVariables } from '@/providers/GlobalVariablesProvider'

import { TEXT_SOCKETS, TEXT_OUTPUTS } from './constants'
import { useSavedNodeData, BaseNode, Field, NumberInput, ColorPicker, NodeSelect, PlaceholderPicker, numberInputClass, textAreaClass, SYSTEM_DEFAULT_FONT, TEXT_ALIGN_BUTTONS, TEXT_VERTICAL_BUTTONS, IconToggleGroup, useHasIncomingEdgeFromType, useAvailablePlaceholders } from './utils'

export function TextNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const { t } = useI18n()
  const saved = useSavedNodeData(id)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const text = (data.text as string) ?? ''
  const fonts = useSystemFonts()
  // Bold defaults true (data.bold !== false, not Boolean(data.bold)) so
  // every Text node saved before this field existed keeps rendering exactly
  // as it always has — TextView/buildText previously hardcoded font-weight:
  // 700 unconditionally, this field just makes that overridable now.
  // Italic has no such history — false is both the default and what "never
  // set" already meant.
  const bold = data.bold !== false
  const italic = Boolean(data.italic)
  const { variables: globalVariables } = useGlobalVariables()
  const availablePlaceholders = useAvailablePlaceholders(id, globalVariables)
  // Roulette Entrants' Content output REPLACES this Text's own template
  // outright (see ROULETTE_ENTRANTS_OUTPUTS' own doc comment in
  // constants.ts / rouletteEntrantsTextValue in overlays/sceneUtils.tsx) —
  // unlike Audio Player's own Content wire, which only ever supplies
  // {artist}/{title} values a template still decides how to use. The
  // textarea goes read-only while connected, same as ImageNode's own URL
  // field does for Audio Player's Content (see its own doc comment) — an
  // editable-but-ignored field would just be confusing.
  const rouletteEntrantsConnected = useHasIncomingEdgeFromType(id, 'content', 'rouletteEntrants')

  const insertPlaceholder = (token: string) => {
    const el = inputRef.current
    const wrapped = `{${token}}`
    const start = el?.selectionStart ?? text.length
    const end = el?.selectionEnd ?? text.length
    const next = text.slice(0, start) + wrapped + text.slice(end)
    updateNodeData(id, { text: next })
    requestAnimationFrame(() => {
      const caret = start + wrapped.length
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  return (
    <BaseNode id={id} data={data} title="Text" labelable category="content" sockets={TEXT_SOCKETS} outputSockets={TEXT_OUTPUTS}>
      <div className="flex flex-col gap-1 text-xs">
        <label>Content</label>
        <div className="flex items-start gap-1">
          <textarea
            ref={inputRef}
            rows={3}
            placeholder={rouletteEntrantsConnected ? 'Provided by Roulette Entrants connection' : undefined}
            disabled={rouletteEntrantsConnected}
            value={text}
            onChange={(e) => updateNodeData(id, { text: e.target.value })}
            className={cn(textAreaClass, rouletteEntrantsConnected && 'opacity-50')}
          />
          {!rouletteEntrantsConnected && <PlaceholderPicker tokens={availablePlaceholders} onInsert={insertPlaceholder} />}
        </div>
      </div>
      <Field label="Color">
        <ColorPicker value={data.color as string || '#ffffff'} onChange={(val) => updateNodeData(id, { color: val })} />
      </Field>
      <Field label="Font">
        <NodeSelect
          value={(data.fontFamily as string) || SYSTEM_DEFAULT_FONT}
          options={[SYSTEM_DEFAULT_FONT, ...fonts]}
          onChange={(next) => updateNodeData(id, { fontFamily: next === SYSTEM_DEFAULT_FONT ? null : next })}
          renderOption={(opt) =>
            opt === SYSTEM_DEFAULT_FONT ? (
              <span className="truncate">Default</span>
            ) : (
              <span className="truncate" style={{ fontFamily: `"${opt}"` }}>
                {opt}
              </span>
            )
          }
        />
      </Field>
      <Field label="Size">
        <NumberInput
          value={data.fontSize as number}
          onChange={(v) => updateNodeData(id, { fontSize: v })}
          min={1}
          fallback={32}
          savedValue={saved.fontSize as number}
          className={numberInputClass}
        />
      </Field>
      <Field label="Letter spacing">
        <NumberInput
          value={data.letterSpacing as number}
          onChange={(v) => updateNodeData(id, { letterSpacing: v })}
          fallback={0}
          savedValue={saved.letterSpacing as number}
          className={numberInputClass}
        />
      </Field>
      <Field label="Line height">
        <NumberInput
          value={data.lineHeight as number}
          onChange={(v) => updateNodeData(id, { lineHeight: v })}
          min={0}
          allowEmpty
          placeholder="auto"
          className={numberInputClass}
        />
      </Field>
      <Field label="Align">
        <IconToggleGroup value={(data.align as string) || 'left'} options={TEXT_ALIGN_BUTTONS} onChange={(next) => updateNodeData(id, { align: next })} />
      </Field>
      <Field label="Vertical">
        <IconToggleGroup
          value={(data.verticalAlign as string) || 'top'}
          options={TEXT_VERTICAL_BUTTONS}
          onChange={(next) => updateNodeData(id, { verticalAlign: next })}
        />
      </Field>
      <Field label="Style">
        <div className="nodrag flex items-center gap-0.5 rounded-md border border-border bg-muted p-0.5 w-fit">
          <button
            type="button"
            title={t.sceneBuilder.tooltip.bold}
            onClick={() => updateNodeData(id, { bold: !bold })}
            className={cn(
              'flex items-center justify-center size-6 rounded transition-colors',
              bold ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Bold className="size-3.5" />
          </button>
          <button
            type="button"
            title={t.sceneBuilder.tooltip.italic}
            onClick={() => updateNodeData(id, { italic: !italic })}
            className={cn(
              'flex items-center justify-center size-6 rounded transition-colors',
              italic ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Italic className="size-3.5" />
          </button>
        </div>
      </Field>
    </BaseNode>
  )
}
