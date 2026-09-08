import { useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { cn } from '@/lib/utils'
import { GradientPoint, GradientStop, GradientValue, buildGradient } from '@/lib/gradient'

const hexInputClass =
  'flex h-7 flex-1 min-w-0 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono uppercase'
const numberInputClass =
  'h-7 w-12 rounded-md border border-input bg-transparent px-1.5 text-xs text-right shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

const DEFAULT_LINEAR_START: GradientPoint = { x: 0, y: 50 }
const DEFAULT_LINEAR_END: GradientPoint = { x: 100, y: 50 }
const DEFAULT_RADIAL_CENTER: GradientPoint = { x: 50, y: 50 }
const DEFAULT_RADIAL_EDGE: GradientPoint = { x: 100, y: 100 }

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * One draggable point on the object preview square below — shared by the
 * linear Start/End pair and the radial Center/Edge pair. Drags in percent
 * of the square's own box (its parent), clamped to `bounds` so e.g. Start/
 * End stay "on the object" while the radial edge handle may range a bit
 * past it (a radius bigger or smaller than the object itself).
 */
function PreviewPoint({
  point,
  bounds,
  size,
  title,
  onChange
}: {
  point: GradientPoint
  bounds: { min: number; max: number }
  size: 'sm' | 'lg'
  title: string
  onChange: (p: GradientPoint) => void
}) {
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>): void => {
    e.stopPropagation()
    const container = e.currentTarget.parentElement
    if (!container) return
    const update = (clientX: number, clientY: number): void => {
      const rect = container.getBoundingClientRect()
      const x = clamp(((clientX - rect.left) / rect.width) * 100, bounds.min, bounds.max)
      const y = clamp(((clientY - rect.top) / rect.height) * 100, bounds.min, bounds.max)
      onChange({ x, y })
    }
    update(e.clientX, e.clientY)
    const move = (ev: PointerEvent): void => update(ev.clientX, ev.clientY)
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <button
      type="button"
      title={title}
      onPointerDown={onPointerDown}
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-white shadow-md ring-2 ring-black/70 active:cursor-grabbing',
        size === 'sm' ? 'size-2.5' : 'size-3.5'
      )}
      style={{ left: `${point.x}%`, top: `${point.y}%`, background: size === 'sm' ? '#94a3b8' : '#334155' }}
    />
  )
}

function nearestStopColor(stops: GradientStop[], position: number): string {
  let best = stops[0]
  let bestDist = Infinity
  for (const s of stops) {
    const d = Math.abs(s.position - position)
    if (d < bestDist) {
      bestDist = d
      best = s
    }
  }
  return best?.color ?? '#ffffff'
}

/**
 * Solid <-> Gradient toggle lives in ColorPicker; this is just the Gradient
 * tab's contents — a Linear/Radial type toggle, an object preview square
 * (drag Start/End for linear, Center/Radius for radial — see GradientValue's
 * own doc comment in lib/gradient.ts for how those map to real CSS), and a
 * draggable-stops color bar (click empty space to add a stop, drag a stop to
 * reposition it, click one to edit its color/position below) whose 0-100
 * positions are always LOGICAL — buildGradient is what maps them onto the
 * real CSS percentages for whichever type/points are currently set. Any
 * number of stops (min 2, enforced by disabling Remove rather than blocking
 * the click).
 *
 * `value`/`onChange` only seed and echo this component's OWN local state —
 * they aren't read again after mount. This is deliberate: ColorPicker
 * remounts GradientEditor fresh every time you open the popover or switch
 * into Gradient mode, which is the only point a re-parse from the prop is
 * actually correct. Treating it as an ordinary controlled component instead
 * (re-deriving `value` from the prop on every render) breaks dragging: the
 * edited gradient round-trips through buildGradient -> the field's stored
 * CSS string -> parseGradient on every single pointermove frame, and each
 * hop rounds the angle and re-projects BOTH points onto the box's center
 * axis (see buildGradient's own doc comment) — including the point you
 * aren't currently dragging. Those small errors compound frame over frame,
 * so the untouched handle visibly crawls away from where you left it and
 * the last color stop creeps inward, letting the start color show through
 * before the edge — exactly the "breaks with a 3rd point" symptom, just
 * from ordinary dragging instead of adding a stop.
 */
export function GradientEditor({ value, onChange }: { value: GradientValue; onChange: (v: GradientValue) => void }) {
  const [local, setLocal] = useState(value)
  const [selected, setSelected] = useState(0)
  const stops = local.stops
  const selectedIndex = Math.min(selected, stops.length - 1)
  const selectedStop = stops[selectedIndex]

  const update = (v: GradientValue): void => {
    setLocal(v)
    onChange(v)
  }

  const updateStop = (i: number, patch: Partial<GradientStop>): void => {
    update({ ...local, stops: stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  }

  const addStopAt = (position: number): void => {
    const color = nearestStopColor(stops, position)
    update({ ...local, stops: [...stops, { color, position }] })
    setSelected(stops.length)
  }

  const removeStop = (i: number): void => {
    if (stops.length <= 2) return
    update({ ...local, stops: stops.filter((_, idx) => idx !== i) })
    setSelected(Math.max(0, i - 1))
  }

  const resetPoints = (): void => {
    if (local.type === 'radial') {
      update({ ...local, center: DEFAULT_RADIAL_CENTER, edge: DEFAULT_RADIAL_EDGE })
    } else {
      update({ ...local, start: DEFAULT_LINEAR_START, end: DEFAULT_LINEAR_END })
    }
  }

  const dragStop =
    (i: number) =>
    (e: React.PointerEvent<HTMLButtonElement>): void => {
      e.stopPropagation()
      setSelected(i)
      const bar = e.currentTarget.parentElement
      if (!bar) return
      const move = (ev: PointerEvent): void => {
        const rect = bar.getBoundingClientRect()
        const pct = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100))
        updateStop(i, { position: Math.round(pct) })
      }
      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

  return (
    <div className="flex w-56 flex-col gap-2.5">
      <div className="flex rounded-md border overflow-hidden text-[11px] font-medium nodrag">
        <button
          type="button"
          onClick={() => update({ ...local, type: 'linear' })}
          className={cn('flex-1 py-1 transition-colors', local.type === 'linear' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          Linear
        </button>
        <button
          type="button"
          onClick={() => update({ ...local, type: 'radial' })}
          className={cn('flex-1 py-1 transition-colors', local.type === 'radial' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          Radial
        </button>
      </div>

      <div className="relative">
        <div
          className="relative aspect-square w-full shrink-0 overflow-hidden rounded shadow-sm ring-1 ring-border nodrag"
          style={{ background: buildGradient(local) }}
          title="Drag the points to position the gradient on the object"
        >
          {local.type === 'linear' ? (
            <>
              <PreviewPoint point={local.start} bounds={{ min: 0, max: 100 }} size="sm" title="Start point" onChange={(p) => update({ ...local, start: p })} />
              <PreviewPoint point={local.end} bounds={{ min: 0, max: 100 }} size="lg" title="End point" onChange={(p) => update({ ...local, end: p })} />
            </>
          ) : (
            <>
              <PreviewPoint point={local.center} bounds={{ min: 0, max: 100 }} size="sm" title="Center" onChange={(p) => update({ ...local, center: p })} />
              <PreviewPoint point={local.edge} bounds={{ min: -25, max: 125 }} size="lg" title="Radius" onChange={(p) => update({ ...local, edge: p })} />
            </>
          )}
        </div>
        <button
          type="button"
          onClick={resetPoints}
          title="Reset point positions to default"
          className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border bg-popover text-muted-foreground shadow-sm hover:text-foreground nodrag"
        >
          <RotateCcw className="size-3" />
        </button>
      </div>

      <div
        className="relative h-6 shrink-0 cursor-copy rounded shadow-sm ring-1 ring-border"
        style={{ background: `linear-gradient(90deg, ${stops.map((s) => `${s.color} ${Math.round(clamp(s.position, 0, 100))}%`).join(', ')})` }}
        title="Click to add a color stop"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
          addStopAt(Math.round(pct))
        }}
      >
        {stops.map((s, i) => (
          <button
            key={i}
            type="button"
            onPointerDown={dragStop(i)}
            onClick={(e) => {
              e.stopPropagation()
              setSelected(i)
            }}
            className={cn(
              'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow',
              i === selectedIndex ? 'z-10 border-white ring-1 ring-black/60' : 'border-white/60'
            )}
            style={{ left: `${s.position}%`, background: s.color }}
          />
        ))}
      </div>

      {selectedStop && (
        <>
          <HexColorPicker color={selectedStop.color} onChange={(c) => updateStop(selectedIndex, { color: c })} style={{ width: '100%', height: 140 }} />
          <div className="flex items-center gap-1.5">
            <HexColorInput color={selectedStop.color} onChange={(c) => updateStop(selectedIndex, { color: c })} prefixed className={hexInputClass} />
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(selectedStop.position)}
              onChange={(e) => updateStop(selectedIndex, { position: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
              className={numberInputClass}
            />
            <span className="text-[11px] text-muted-foreground">%</span>
            <button
              type="button"
              disabled={stops.length <= 2}
              onClick={() => removeStop(selectedIndex)}
              title="Remove this color"
              className="text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:hover:text-muted-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </>
      )}

      <button type="button" onClick={() => addStopAt(50)} className="self-start text-[11px] text-muted-foreground hover:text-foreground">
        + Add color
      </button>
    </div>
  )
}
