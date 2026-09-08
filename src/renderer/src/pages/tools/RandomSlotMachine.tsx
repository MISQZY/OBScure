import { useEffect, useState } from 'react'

/**
 * One rolling digit box — same "prefill a strip of random numbers, then
 * transition-stop on the real one" trick a physical slot machine uses.
 * Originally private to RandomToolPage.tsx; pulled out here (mirrors
 * RouletteWheel.tsx's own split from RouletteToolPage.tsx) so the overlay's
 * own Random Widget (see RandomWidgetView in overlays/views/index.tsx /
 * buildRandomWidget in overlays/custom.html's React-less port) can reuse the
 * exact same visual instead of a second reimplementation.
 *
 * `animate=false` skips the roll entirely and just shows `targetNumber` at
 * rest — the Scene Builder editor has no live round to roll toward (see
 * RandomWidgetView's own doc comment), same reasoning RouletteWheel's own
 * `animate` prop exists for.
 *
 * `scale` resizes the box/font proportionally (1 = the original fixed
 * 54px/text-3xl sizing) — lets a Size modifier resize the whole widget (see
 * RandomWidgetView) the same way RouletteWheel's own `size` prop does,
 * without hand-picking new Tailwind size classes for every scale.
 */
/** Stop delay for the i-th rolling digit — staggered so they don't all land at once. */
export function slotStopDelayMs(i: number): number {
  return 1500 + i * 400
}

export function SlotMachineNumber({
  targetNumber,
  min,
  max,
  stopDelayMs,
  animate = true,
  scale = 1
}: {
  targetNumber: number
  min: number
  max: number
  stopDelayMs: number
  animate?: boolean
  scale?: number
}) {
  const [rolling, setRolling] = useState(animate)
  const [strip] = useState<number[]>(() => {
    if (!animate) return [targetNumber]
    const arr = [targetNumber]
    for (let i = 0; i < 40; i++) {
      arr.push(min + Math.floor(Math.random() * (max - min + 1)))
    }
    return arr
  })

  useEffect(() => {
    if (!animate) return
    const t = setTimeout(() => {
      setRolling(false)
    }, 50)

    return () => clearTimeout(t)
  }, [animate])

  const maxChars = Math.max(min.toString().length, max.toString().length)
  const boxHeight = 54 * scale

  return (
    <div
      className="relative overflow-hidden inline-flex justify-center items-start bg-muted/30 rounded-md text-center font-mono ring-1 ring-border shadow-inner font-bold"
      style={{ width: `calc(${maxChars}ch + ${1.25 * scale}rem)`, height: boxHeight, paddingLeft: 10 * scale, paddingRight: 10 * scale, fontSize: 30 * scale }}
    >
      <div
        className="flex flex-col transition-transform w-full"
        style={{
          transform: rolling ? `translateY(-${(strip.length - 1) * boxHeight}px)` : `translateY(0)`,
          transitionDuration: rolling ? '0ms' : `${stopDelayMs}ms`,
          transitionTimingFunction: 'cubic-bezier(0.15, 0.85, 0.35, 1)' // smooth deceleration
        }}
      >
        {strip.map((n, i) => (
          <div key={i} className="flex-shrink-0 flex items-center justify-center leading-none" style={{ height: boxHeight }}>
            {n}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * A full roll — one SlotMachineNumber per rolled value, laid out in a row
 * (RandomToolPage.tsx's own original inline layout) by default. `size`
 * scales the whole row the same way RouletteWheel's own `size` prop does
 * (320 is that component's own default baseline, reused here purely so a
 * Size modifier's px value means about the same "how big" for either
 * widget). `flexDirection`/`gap` let a caller with more than one number to
 * arrange (the overlay's own Random Widget, via its own Ordering socket —
 * see RANDOM_WIDGET_SOCKETS in components/nodes/constants.ts) override the
 * row default; RandomToolPage.tsx itself never needs to, one number always
 * looking the same regardless of direction.
 */
export function RandomSlotMachine({
  numbers,
  min,
  max,
  animate,
  size = 320,
  flexDirection = 'row',
  gap = 12
}: {
  numbers: number[]
  min: number
  max: number
  animate: boolean
  size?: number
  flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse'
  gap?: number
}) {
  const scale = size / 320
  return (
    <div
      className="flex justify-center"
      style={{ flexDirection, flexWrap: flexDirection === 'row' || flexDirection === 'row-reverse' ? 'wrap' : 'nowrap', gap: gap * scale }}
    >
      {numbers.map((n, i) => (
        <SlotMachineNumber key={i} targetNumber={n} min={min} max={max} stopDelayMs={slotStopDelayMs(i)} animate={animate} scale={scale} />
      ))}
    </div>
  )
}
