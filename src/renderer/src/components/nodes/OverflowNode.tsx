import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { Checkbox } from '@/components/ui/checkbox'
import { BaseNode, Field, NodeSelect, NumberInput, numberInputClass, OVERFLOW_MODES, SCROLL_DIRECTIONS } from './utils'

/**
 * Clips or scrolls whatever it's wired into once content exceeds its box —
 * needs a Size (fixed width and/or height) on the same target to actually
 * have anything to overflow against, same as Position needing a real anchor.
 * 'hidden' on both axes reads as plain "overflow: hidden" clipping; 'auto'/
 * 'scroll' on an axis makes that axis scrollable (mouse wheel/touch — same
 * as any normal scrollable div, no extra wiring). Hide scrollbar keeps the
 * clipping/scrolling behavior but drops the visible scrollbar track, for a
 * cleaner look in a broadcast overlay.
 *
 * Auto-scroll (Text only for now — see overflowAutoScroll in
 * overlays/sceneUtils.tsx) plays a continuous, looping scroll instead of
 * requiring an actual mouse/touch to move it — for a credits-style list
 * (e.g. Roulette Entrants' formatted rows feeding a Text node) that's too
 * long to fit its box and should just cycle through on its own. Direction
 * picks which axis animates; Speed is px/second, NOT a fixed seconds-per-
 * loop duration — a fixed duration made a long list race past unreadably
 * fast while a short one crawled, since both got squeezed into/stretched
 * across the same total time. Speed keeps the READING pace constant no
 * matter how many rows there are; the renderer measures the actual content
 * size and works out how long one loop takes from that.
 */
export function OverflowNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const overflowX = (data.overflowX as string) || 'hidden'
  const overflowY = (data.overflowY as string) || 'hidden'
  const autoScroll = Boolean(data.autoScroll)
  const scrollDirection = (data.scrollDirection as string) || 'up'
  return (
    <BaseNode id={id} data={data} title="Overflow" category="style">
      <Field label="Overflow X">
        <NodeSelect value={overflowX} options={OVERFLOW_MODES} onChange={(next) => updateNodeData(id, { overflowX: next })} />
      </Field>
      <Field label="Overflow Y">
        <NodeSelect value={overflowY} options={OVERFLOW_MODES} onChange={(next) => updateNodeData(id, { overflowY: next })} />
      </Field>
      <Field label="Hide scrollbar">
        <Checkbox
          checked={data.hideScrollbar !== false}
          onCheckedChange={(checked) => updateNodeData(id, { hideScrollbar: !!checked })}
          className="nodrag"
        />
      </Field>
      <Field label="Auto-scroll">
        <Checkbox checked={autoScroll} onCheckedChange={(checked) => updateNodeData(id, { autoScroll: !!checked })} className="nodrag" />
      </Field>
      {autoScroll && (
        <>
          <Field label="Direction">
            <NodeSelect value={scrollDirection} options={SCROLL_DIRECTIONS} onChange={(next) => updateNodeData(id, { scrollDirection: next })} />
          </Field>
          <Field label="Speed (px/s)">
            <NumberInput value={data.scrollSpeed as number} onChange={(v) => updateNodeData(id, { scrollSpeed: v })} min={5} fallback={40} className={numberInputClass} />
          </Field>
          <p className="text-[11px] text-muted-foreground leading-snug w-40">Text only for now. Needs a Size on this same target to have a box to scroll within.</p>
        </>
      )}
    </BaseNode>
  )
}
