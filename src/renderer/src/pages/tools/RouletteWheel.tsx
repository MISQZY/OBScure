import { useEffect, useRef } from 'react'
import type { RouletteEntrant } from '@shared/types'

// Must match RouletteEngine.SPIN_DURATION_MS
export const SPIN_DURATION_MS = 5000
export const WHEEL_EXTRA_SPINS = 6

export function wheelSectorColor(index: number): string {
  return `hsl(${(index * 137.508) % 360} 62% 54%)`
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeSector(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  if (endAngle - startAngle >= 360) {
    endAngle = startAngle + 359.99
  }
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}

const LABEL_INNER_RADIUS = 18
const LABEL_OUTER_RADIUS = 88
const LABEL_FONT_SIZE = 7.5
const LABEL_CHAR_WIDTH_RATIO = 0.58
const LABEL_PADDING = 3

function labelFits(name: string, sweepDeg: number): boolean {
  const angularSpaceAtStart = ((sweepDeg * Math.PI) / 180) * LABEL_INNER_RADIUS
  if (angularSpaceAtStart < LABEL_FONT_SIZE + LABEL_PADDING) return false
  const textWidth = name.length * LABEL_FONT_SIZE * LABEL_CHAR_WIDTH_RATIO
  return textWidth + LABEL_PADDING <= LABEL_OUTER_RADIUS - LABEL_INNER_RADIUS
}

export interface RouletteWheelProps {
  entrants: RouletteEntrant[]
  rotation: number
  winnerId: string | null
  animate: boolean
  tracking: boolean
  onTick?: (name: string | null) => void
  /** Rendered pixel size (both width and height — the wheel is always square). Defaults to 320 (the standalone Roulette tool page's own h-80/w-80). Lets a scene's own Size modifier resize the wheel widget (see RouletteWheelView in overlays/views/index.tsx / buildRouletteWheel in overlays/custom.html) without touching the SVG's own viewBox math. */
  size?: number
}

export function RouletteWheel({ entrants, rotation, winnerId, animate, tracking, onTick, size = 320 }: RouletteWheelProps): React.JSX.Element {
  const totalWeight = entrants.reduce((sum, entrant) => sum + entrant.weight, 0)
  let cursor = 0
  const sectors = entrants.map((entrant, index) => {
    const sweep = totalWeight > 0 ? (entrant.weight / totalWeight) * 360 : 0
    const sector = { entrant, start: cursor, end: cursor + sweep, color: wheelSectorColor(index) }
    cursor += sweep
    return sector
  })

  const groupRef = useRef<SVGGElement>(null)
  const sectorsRef = useRef(sectors)
  sectorsRef.current = sectors

  useEffect(() => {
    if (!tracking) {
      onTick?.(null)
      return
    }
    let frameId: number
    let lastName: string | null = null
    const tick = (): void => {
      const el = groupRef.current
      if (el) {
        let angleDeg = 0
        const transform = window.getComputedStyle(el).transform
        if (transform && transform !== 'none') {
          try {
            const matrix = new DOMMatrixReadOnly(transform)
            angleDeg = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI
          } catch {
            angleDeg = 0
          }
        }
        const normalized = ((angleDeg % 360) + 360) % 360
        const pointerAngle = (360 - normalized) % 360
        const sector = sectorsRef.current.find((s) => pointerAngle >= s.start && pointerAngle < s.end)
        const name = sector?.entrant.name ?? null
        if (name !== lastName) {
          lastName = name
          onTick?.(name)
        }
      }
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [tracking, onTick])

  return (
    <div className="relative mx-auto shrink-0" style={{ height: size, width: size }}>
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <g
          ref={groupRef}
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: '100px 100px',
            transition: animate ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.72, 0.15, 1)` : 'none'
          }}
        >
          {sectors.length === 0 ? (
            <circle cx={100} cy={100} r={92} className="fill-muted stroke-border" strokeWidth={1} />
          ) : (
            sectors.map(({ entrant, start, end, color }) => {
              const mid = (start + end) / 2
              const flip = mid > 180 && mid < 360
              const rotateAngle = flip ? mid - 270 : mid - 90
              const anchorX = flip ? 100 - LABEL_INNER_RADIUS : 100 + LABEL_INNER_RADIUS
              return (
                <g key={entrant.id} opacity={winnerId && entrant.id !== winnerId ? 0.4 : 1}>
                  <path d={describeSector(100, 100, 92, start, end)} fill={color} className="stroke-card" strokeWidth={1.5} />
                  {labelFits(entrant.name, end - start) && (
                    <text
                      x={anchorX}
                      y={100}
                      transform={`rotate(${rotateAngle} 100 100)`}
                      textAnchor={flip ? 'end' : 'start'}
                      dominantBaseline="middle"
                      fontSize={LABEL_FONT_SIZE}
                      className="fill-white"
                      style={{ pointerEvents: 'none' }}
                    >
                      {entrant.name}
                    </text>
                  )}
                </g>
              )
            })
          )}
          <circle cx={100} cy={100} r={94} fill="none" className="stroke-foreground" strokeWidth={2} />
        </g>
        <polygon points="100,4 91,21 109,21" className="fill-foreground" stroke="black" strokeWidth={1} strokeLinejoin="round" />
        <circle cx={100} cy={100} r={9} className="fill-card stroke-border" strokeWidth={1.5} />
      </svg>
    </div>
  )
}
