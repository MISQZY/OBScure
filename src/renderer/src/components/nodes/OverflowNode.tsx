import React from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { Checkbox } from '@/components/ui/checkbox'
import { BaseNode, Field, NodeSelect, NumberInput, numberInputClass, SCROLL_DIRECTIONS } from './utils'

/**
 * Clips whatever it's wired into once content exceeds its box — needs a
 * Size (fixed width and/or height) on the same target to actually have
 * anything to clip against, same as Position needing a real anchor. Purely
 * `overflow: hidden`/`visible` per axis; there's no scrollable ('auto'/
 * 'scroll') mode, since an OBS Browser Source has no mouse/touch reaching
 * it in the actual broadcast output for anyone to scroll with — offering
 * one just showed a dead scrollbar nobody could ever use.
 *
 * Auto-scroll (Text only for now — see overflowAutoScroll in
 * overlays/sceneUtils.tsx) is the actual answer to "content too long for
 * its box": a continuous, looping scroll instead of requiring a mouse/
 * touch to move it — for a credits-style list (e.g. Roulette Entrants'
 * formatted rows feeding a Text node) that's too long to fit and should
 * just cycle through on its own. Direction picks which axis animates;
 * Speed is px/second, NOT a fixed seconds-per-loop duration — a fixed
 * duration made a long list race past unreadably fast while a short one
 * crawled, since both got squeezed into/stretched across the same total
 * time. Speed keeps the READING pace constant no matter how many rows
 * there are; the renderer measures the actual content size and works out
 * how long one loop takes from that.
 */
export function OverflowNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const clipX = data.overflowX !== 'visible'
  const clipY = data.overflowY !== 'visible'
  const autoScroll = Boolean(data.autoScroll)
  const scrollDirection = (data.scrollDirection as string) || 'up'
  return (
    <BaseNode id={id} data={data} title="Overflow" category="style">
      <Field label="Clip X">
        <Checkbox checked={clipX} onCheckedChange={(checked) => updateNodeData(id, { overflowX: checked ? 'hidden' : 'visible' })} className="nodrag" />
      </Field>
      <Field label="Clip Y">
        <Checkbox checked={clipY} onCheckedChange={(checked) => updateNodeData(id, { overflowY: checked ? 'hidden' : 'visible' })} className="nodrag" />
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
