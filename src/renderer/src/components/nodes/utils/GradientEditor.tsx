import { useState } from 'react'
import { X } from 'lucide-react'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { cn } from '@/lib/utils'
import { GradientStop, GradientValue, buildGradient } from '@/lib/gradient'

const hexInputClass =
  'flex h-7 flex-1 min-w-0 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono uppercase'
const numberInputClass =
  'h-7 w-12 rounded-md border border-input bg-transparent px-1.5 text-xs text-right shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/** A small draggable dial for the gradient's angle — the line from center IS the "gradient line" (its direction is the direction colors flow in), dragging it rotates the whole gradient. 0deg points up, increases clockwise, matching CSS's own linear-gradient(<angle>deg, ...) convention. */
function AngleDial({ angle, onChange }: { angle: number; onChange: (angle: number) => void }) {
  const updateFromPoint = (el: HTMLElement, clientX: number, clientY: number): void => {
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = clientX - cx
    const dy = clientY - cy
    if (dx === 0 && dy === 0) return
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    if (deg < 0) deg += 360
    onChange(Math.round(deg))
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    const el = e.currentTarget
    updateFromPoint(el, e.clientX, e.clientY)
    const move = (ev: PointerEvent): void => updateFromPoint(el, ev.clientX, ev.clientY)
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const rad = (angle * Math.PI) / 180
  const handleX = 50 + Math.sin(rad) * 38
  const handleY = 50 - Math.cos(rad) * 38

  return (
    <div
      onPointerDown={onPointerDown}
      title="Drag to rotate the gradient"
      className="relative size-8 shrink-0 cursor-pointer rounded-full border border-input bg-muted/40"
    >
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full">
        <line x1="50" y1="50" x2={handleX} y2={handleY} stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="text-foreground" />
        <circle cx="50" cy="50" r="8" fill="currentColor" className="text-muted-foreground" />
      </svg>
    </div>
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

/** Solid <-> Gradient toggle lives in ColorPicker; this is just the Gradient tab's contents — angle dial, a draggable-stops preview bar (click empty space to add a stop, drag a stop to reposition it, click one to edit its color/position below), and the selected stop's own color/position/remove controls. Any number of stops (min 2, enforced by disabling Remove rather than blocking the click). */
export function GradientEditor({ value, onChange }: { value: GradientValue; onChange: (v: GradientValue) => void }) {
  const [selected, setSelected] = useState(0)
  const stops = value.stops
  const selectedIndex = Math.min(selected, stops.length - 1)
  const selectedStop = stops[selectedIndex]

  const updateStop = (i: number, patch: Partial<GradientStop>): void => {
    onChange({ ...value, stops: stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  }

  const addStopAt = (position: number): void => {
    const color = nearestStopColor(stops, position)
    onChange({ ...value, stops: [...stops, { color, position }] })
    setSelected(stops.length)
  }

  const removeStop = (i: number): void => {
    if (stops.length <= 2) return
    onChange({ ...value, stops: stops.filter((_, idx) => idx !== i) })
    setSelected(Math.max(0, i - 1))
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
      <div className="flex items-center gap-2">
        <AngleDial angle={value.angle} onChange={(angle) => onChange({ ...value, angle })} />
        <input
          type="number"
          value={Math.round(value.angle)}
          onChange={(e) => onChange({ ...value, angle: Number(e.target.value) || 0 })}
          className={numberInputClass}
        />
        <span className="text-[11px] text-muted-foreground">deg</span>
      </div>

      <div
        className="relative h-6 shrink-0 cursor-copy rounded border shadow-sm"
        style={{ background: buildGradient(value.angle, stops) }}
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
