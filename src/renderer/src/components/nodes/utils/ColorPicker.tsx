import { HexColorPicker, HexColorInput } from 'react-colorful'
import { cn } from '@/lib/utils'
import { buildGradient, isGradientColor, parseGradient } from '@/lib/gradient'
import { NodePopover } from './NodePopover'
import { GradientEditor } from './GradientEditor'

/**
 * `value` is either a plain `#rrggbb` or a `linear-gradient(...)` CSS string
 * (see lib/gradient.ts) — the Solid/Gradient tabs below just decide which
 * kind onChange produces next; every call site (BoxNode's background/border,
 * TextNode's color, ShadowNode's color, ...) stays untouched, since a
 * gradient string is still just a string. Whether a given field actually
 * RENDERS a gradient it's handed is up to that field's own consumer
 * (BoxView's background works for free via plain CSS; border-color/text
 * color/shadow filter each need their own gradient-aware helper in
 * sceneUtils/style.ts, since none of those CSS properties take a gradient
 * directly).
 *
 * `allowGradient` (default true) hides the Solid/Gradient toggle for a field
 * whose consumer has no way to render a gradient at all — e.g.
 * BackgroundAnimationNode's color feeds a CSS `color-mix()`/custom-property
 * tint (see background-animations.css), which needs a single color token,
 * not a `linear-gradient(...)` string.
 */
export function ColorPicker({
  value,
  onChange,
  allowGradient = true
}: {
  value: string
  onChange: (v: string) => void
  allowGradient?: boolean
}) {
  const gradient = allowGradient && isGradientColor(value) ? parseGradient(value) : null
  const isGradient = gradient != null

  const setSolid = (): void => {
    if (!isGradient) return
    onChange(gradient.stops[0]?.color || '#ffffff')
  }
  const setGradient = (): void => {
    if (isGradient) return
    onChange(buildGradient(90, [{ color: value || '#ffffff', position: 0 }, { color: '#000000', position: 100 }]))
  }

  return (
    <div className="flex items-center gap-1.5 nodrag">
      {isGradient ? (
        <span className="font-mono text-[10px] text-muted-foreground uppercase w-[4.5rem] text-right truncate">Gradient</span>
      ) : (
        <HexColorInput
          color={value}
          onChange={onChange}
          prefixed
          className="font-mono text-[10px] text-muted-foreground uppercase bg-transparent w-[4.5rem] outline-none focus:text-foreground text-right border-b border-transparent focus:border-border transition-colors"
        />
      )}
      <NodePopover
        className="w-auto p-3 flex flex-col gap-3"
        trigger={
          <button
            type="button"
            className="size-5 rounded border shadow-sm ring-1 ring-border/50 cursor-pointer p-0 shrink-0"
            style={{ background: value }}
          />
        }
      >
        {allowGradient && (
          <div className="flex rounded-md border overflow-hidden text-[11px] font-medium nodrag">
            <button
              type="button"
              onClick={setSolid}
              className={cn('flex-1 py-1 transition-colors', !isGradient ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              Solid
            </button>
            <button
              type="button"
              onClick={setGradient}
              className={cn('flex-1 py-1 transition-colors', isGradient ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              Gradient
            </button>
          </div>
        )}
        {isGradient ? (
          <GradientEditor value={gradient} onChange={(g) => onChange(buildGradient(g.angle, g.stops))} />
        ) : (
          <>
            <HexColorPicker color={value} onChange={onChange} />
            <HexColorInput
              color={value}
              onChange={onChange}
              prefixed
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono uppercase"
            />
          </>
        )}
      </NodePopover>
    </div>
  )
}
