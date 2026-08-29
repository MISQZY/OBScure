import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CopyableValue } from '@/components/CopyableValue'
import { useI18n } from '@/providers/I18nProvider'
import {
  DEFAULT_ROULETTE_CONFIG,
  MAX_ROULETTE_DURATION_SECONDS,
  MIN_ROULETTE_DURATION_SECONDS,
  type RouletteConfig,
  type RouletteEntryMode
} from '@shared/eventsConfig'
import type { RouletteEntrant, RouletteStatePayload, TwitchCustomReward } from '@shared/types'

const IDLE_STATE: RouletteStatePayload = { phase: 'idle', entrants: [], endsAt: null, winner: null, hash: null, seed: null }
const NONE_VALUE = '__none__'
// Must match RouletteEngine.SPIN_DURATION_MS (src/main/eventsEngine.ts) — the wheel's
// spin animation is timed to land exactly when the backend flips to the 'result' phase.
const SPIN_DURATION_MS = 5000
const WHEEL_EXTRA_SPINS = 6

/**
 * Digital-clock style countdown ("0:45", "12:30", "1:02:30", "3:04:02:30")
 * — grows a leading unit only once it's actually needed, so a normal
 * few-minute round still reads as plain M:SS instead of always carrying
 * "0:" hours/days. Entry windows now go up to MAX_ROULETTE_DURATION_SECONDS
 * (a week), where a raw seconds count (as this badge used to show) would be
 * unreadable.
 */
function formatCountdown(totalSeconds: number): string {
  const total = Math.max(0, Math.trunc(totalSeconds))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  if (days > 0) return `${days}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${minutes}:${pad(seconds)}`
}

/** Evenly-spaced hues via the golden angle so adjacent sectors stay visually distinct regardless of entrant count. */
function wheelSectorColor(index: number): string {
  return `hsl(${(index * 137.508) % 360} 62% 54%)`
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeSector(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  if (endAngle - startAngle >= 360) {
    endAngle = startAngle + 359.99 // SVG arcs fail if start and end points are identical
  }
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}

// Labels run radially, center → edge, along each sector's bisector — starting past the
// center hub and ending short of the outer ring.
const LABEL_INNER_RADIUS = 18
const LABEL_OUTER_RADIUS = 88
const LABEL_FONT_SIZE = 7.5
// Rough average glyph width as a fraction of font-size — good enough for a fits/doesn't-fit
// call without measuring actual text metrics (which SVG can't do synchronously pre-paint).
const LABEL_CHAR_WIDTH_RATIO = 0.58
const LABEL_PADDING = 3

/**
 * Whether `name` has room to render along its sector's radial spoke: the sector must be
 * wide enough (angularly, at the point closest to center — the tightest spot, since a
 * sector only widens further out) to fit the label's height, and the label's estimated
 * length must fit between LABEL_INNER_RADIUS and LABEL_OUTER_RADIUS.
 */
function labelFits(name: string, sweepDeg: number): boolean {
  const angularSpaceAtStart = ((sweepDeg * Math.PI) / 180) * LABEL_INNER_RADIUS
  if (angularSpaceAtStart < LABEL_FONT_SIZE + LABEL_PADDING) return false
  const textWidth = name.length * LABEL_FONT_SIZE * LABEL_CHAR_WIDTH_RATIO
  return textWidth + LABEL_PADDING <= LABEL_OUTER_RADIUS - LABEL_INNER_RADIUS
}

interface RouletteWheelProps {
  entrants: RouletteEntrant[]
  rotation: number
  winnerId: string | null
  animate: boolean
  /** Whether to track which entrant is currently under the pointer and report it via onTick — true only while the wheel is actually spinning towards a winner, not just whenever a CSS transition happens to still be in flight. */
  tracking: boolean
  onTick?: (name: string | null) => void
}

/** The wheel's slice sizes are proportional to each entrant's weight (entry count), so it visually doubles as a chance display. */
function RouletteWheel({ entrants, rotation, winnerId, animate, tracking, onTick }: RouletteWheelProps): React.JSX.Element {
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

  // Polls the wheel's actual on-screen rotation (via the CSS transition's live computed
  // transform, not the target `rotation` prop) every frame so the pointer badge can name
  // whichever entrant the wheel is passing under the pointer as it spins — a classic
  // wheel-of-fortune ticker. Reading the computed style is what makes this track the
  // *animated* angle rather than jumping straight to the end value.
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
    <div className="relative mx-auto h-80 w-80 shrink-0">
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
              // rotate(mid - 90) alone would place the label along the sector's bisector
              // starting from the center, but past the wheel's left side that rotates the
              // glyphs themselves past 90° — i.e. upside-down. There, mirror the anchor to
              // the opposite side of center and rotate by (mid - 270) instead: a rotation
              // that stays within +/-90° of horizontal, so the glyphs never invert, while
              // textAnchor="end" keeps the label reading center → edge either way.
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

type DurationUnitId = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks'

/** Smallest to largest — pickDurationUnit below walks this backwards. */
const DURATION_UNIT_IDS: DurationUnitId[] = ['seconds', 'minutes', 'hours', 'days', 'weeks']

const DURATION_UNIT_SECONDS: Record<DurationUnitId, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
  weeks: 604800
}

/** Largest unit that divides `seconds` evenly, so e.g. 3600 defaults to "1 hours" instead of "60 minutes" — display-only, switching the unit by hand always works regardless of the underlying value. */
function pickDurationUnit(seconds: number): DurationUnitId {
  for (let i = DURATION_UNIT_IDS.length - 1; i >= 0; i--) {
    const unit = DURATION_UNIT_IDS[i]
    const unitSeconds = DURATION_UNIT_SECONDS[unit]
    if (seconds >= unitSeconds && seconds % unitSeconds === 0) return unit
  }
  return 'seconds'
}

interface DurationInputProps {
  id: string
  seconds: number
  onChange: (seconds: number) => void
  min: number
  max: number
}

/**
 * A number+unit pair (e.g. "10" + "minutes") that always resolves back to a
 * single seconds value — RouletteConfig.durationSeconds stays a plain
 * number, this just lets it be entered in whatever unit is convenient
 * instead of forcing everything through raw seconds (awkward once durations
 * run up to MAX_ROULETTE_DURATION_SECONDS, a week). Changing the unit only
 * re-expresses the SAME total in a different scale; it doesn't change the
 * total by itself, only the amount field does (and only once clamped to
 * [min, max]).
 */
function DurationInput({ id, seconds, onChange, min, max }: DurationInputProps): React.JSX.Element {
  const { t } = useI18n()
  const [unit, setUnit] = useState<DurationUnitId>(() => pickDurationUnit(seconds))
  const unitSeconds = DURATION_UNIT_SECONDS[unit]
  const amount = seconds / unitSeconds

  const unitLabel: Record<DurationUnitId, string> = {
    seconds: t.events.roulette.durationUnitSeconds,
    minutes: t.events.roulette.durationUnitMinutes,
    hours: t.events.roulette.durationUnitHours,
    days: t.events.roulette.durationUnitDays,
    weeks: t.events.roulette.durationUnitWeeks
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        id={id}
        type="number"
        min={0}
        max={max / unitSeconds}
        step="any"
        className="w-20"
        value={Number.isFinite(amount) ? Number(amount.toFixed(2)) : ''}
        onChange={(event) => {
          const nextAmount = Number(event.target.value)
          if (!Number.isFinite(nextAmount)) return
          const totalSeconds = Math.round(nextAmount * unitSeconds)
          onChange(Math.min(max, Math.max(min, totalSeconds)))
        }}
      />
      <Select value={unit} onValueChange={(value) => setUnit(value as DurationUnitId)}>
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DURATION_UNIT_IDS.map((u) => (
            <SelectItem key={u} value={u}>
              {unitLabel[u]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Internal tool, no Browser Source of its own — entrants join via chat/points and the result only shows here in the app. */
export function RouletteToolPage() {
  const { t } = useI18n()
  const [config, setConfig] = useState<RouletteConfig>(DEFAULT_ROULETTE_CONFIG)
  const [saved, setSaved] = useState(false)
  const [state, setState] = useState<RouletteStatePayload>(IDLE_STATE)
  const [rewards, setRewards] = useState<TwitchCustomReward[]>([])
  const [manualName, setManualName] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [wheelRotation, setWheelRotation] = useState(0)
  const [animateWheel, setAnimateWheel] = useState(false)
  const [spinningName, setSpinningName] = useState<string | null>(null)
  const wheelRotationRef = useRef(0)
  const prevPhaseRef = useRef<RouletteStatePayload['phase']>(state.phase)
  // Which winner id the wheel is currently resting on — guards against re-computing
  // (and re-flying-off) on every state push for the same still-standing result, and
  // is what lets a fresh mount (e.g. navigating back to this page while a round is
  // already in 'result') detect it never actually watched the spin happen.
  const positionedWinnerIdRef = useRef<string | null>(null)

  useEffect(() => {
    window.maddoner.getEventsConfig('roulette').then(setConfig)
    window.maddoner.getRouletteState().then(setState)
    window.maddoner.getTwitchRewards().then(setRewards)
    return window.maddoner.onRouletteState(setState)
  }, [])

  // The countdown display ticks locally between the state pushes the round's
  // start/entrant events actually trigger — endsAt (from the server) stays the source of truth.
  useEffect(() => {
    if (state.phase !== 'collecting') return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [state.phase])

  // Spins the wheel to land on the winner the instant the backend reveals one — the
  // backend already knows the winner at the start of 'spinning' (see RouletteEngine),
  // so the animation just has SPIN_DURATION_MS to visually arrive at that answer. If
  // this component instance never actually saw the collecting → spinning transition
  // (e.g. it just mounted because the user navigated back to this page mid-spin or
  // after a result that's still standing — 'result' persists until the next round,
  // see RouletteEngine), it instead snaps straight to the correct resting position
  // with no animation, rather than defaulting to rotation 0 and leaving the winner's
  // sector wherever it happens to fall.
  useEffect(() => {
    const prevPhase = prevPhaseRef.current
    prevPhaseRef.current = state.phase
    if ((state.phase !== 'spinning' && state.phase !== 'result') || !state.winner) return
    if (positionedWinnerIdRef.current === state.winner.id) return
    positionedWinnerIdRef.current = state.winner.id

    const totalWeight = state.entrants.reduce((sum, entrant) => sum + entrant.weight, 0)
    let cursor = 0
    let winnerMid = 0
    for (const entrant of state.entrants) {
      const sweep = totalWeight > 0 ? (entrant.weight / totalWeight) * 360 : 0
      if (entrant.id === state.winner.id) {
        winnerMid = cursor + sweep / 2
        break
      }
      cursor += sweep
    }

    const current = wheelRotationRef.current
    const currentMod = ((current % 360) + 360) % 360
    const delta = (360 - winnerMid - currentMod + 360) % 360
    const next = current + delta + WHEEL_EXTRA_SPINS * 360
    wheelRotationRef.current = next
    setAnimateWheel(state.phase === 'spinning' && prevPhase === 'collecting')
    setWheelRotation(next)
  }, [state.phase, state.winner, state.entrants])

  const save = async (): Promise<void> => {
    const normalized = await window.maddoner.setEventsConfig('roulette', config)
    setConfig(normalized)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const start = async (): Promise<void> => {
    setState(await window.maddoner.startRoulette(config.durationSeconds))
  }

  const cancel = async (): Promise<void> => {
    setState(await window.maddoner.cancelRoulette())
  }

  const finishEarly = async (): Promise<void> => {
    setState(await window.maddoner.finishRouletteEarly())
  }

  const addManual = async (): Promise<void> => {
    if (!manualName.trim()) return
    setState(await window.maddoner.addRouletteEntrant(manualName))
    setManualName('')
  }

  const removeEntrant = async (id: string): Promise<void> => {
    setState(await window.maddoner.removeRouletteEntrant(id))
  }

  const secondsLeft = state.endsAt ? Math.max(0, Math.ceil((state.endsAt - now) / 1000)) : 0
  const totalWeight = state.entrants.reduce((sum, entrant) => sum + entrant.weight, 0)

  const phaseLabel = {
    idle: t.events.roulette.phaseIdle,
    collecting: t.events.roulette.phaseCollecting,
    spinning: t.events.roulette.phaseSpinning,
    result: t.events.roulette.phaseResult
  }[state.phase]

  const sourceLabel = {
    chat: t.events.roulette.entrySourceChat,
    points: t.events.roulette.entrySourcePoints,
    manual: t.events.roulette.entrySourceManual
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.events.roulette.title}</h1>
        <p className="text-sm text-muted-foreground">{t.events.roulette.description}</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="roulette-command">{t.events.roulette.commandLabel}</Label>
          <Input
            id="roulette-command"
            className="w-40"
            placeholder={t.events.roulette.commandPlaceholder}
            value={config.command}
            onChange={(event) => setConfig((c) => ({ ...c, command: event.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="roulette-duration">{t.events.roulette.durationLabel}</Label>
          <DurationInput
            id="roulette-duration"
            seconds={config.durationSeconds}
            onChange={(durationSeconds) => setConfig((c) => ({ ...c, durationSeconds }))}
            min={MIN_ROULETTE_DURATION_SECONDS}
            max={MAX_ROULETTE_DURATION_SECONDS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="roulette-reward">{t.events.roulette.pointsRewardLabel}</Label>
          <Select
            value={config.pointsRewardId ?? NONE_VALUE}
            onValueChange={(value) => setConfig((c) => ({ ...c, pointsRewardId: value === NONE_VALUE ? null : value }))}
          >
            <SelectTrigger id="roulette-reward" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>{t.events.roulette.pointsRewardNone}</SelectItem>
              {rewards.map((reward) => (
                <SelectItem key={reward.id} value={reward.id}>
                  {reward.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="roulette-entry-mode">{t.events.roulette.entryModeLabel}</Label>
          <Select
            value={config.entryMode}
            onValueChange={(value) => setConfig((c) => ({ ...c, entryMode: value as RouletteEntryMode }))}
          >
            <SelectTrigger id="roulette-entry-mode" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.events.roulette.entryModeAll}</SelectItem>
              <SelectItem value="followers">{t.events.roulette.entryModeFollowers}</SelectItem>
              <SelectItem value="subscribers">{t.events.roulette.entryModeSubscribers}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save} variant="outline" className="self-end">
          {saved ? t.common.saved : t.common.save}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t.events.roulette.commandHint} {t.events.roulette.pointsRewardHint} {t.events.roulette.pointsStackHint}{' '}
        {config.entryMode === 'followers' && t.events.roulette.entryModeHintFollowers}
        {config.entryMode === 'subscribers' && t.events.roulette.entryModeHintSubscribers}
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {state.phase === 'idle' || state.phase === 'result' ? (
            <Button onClick={start} size="sm">
              {t.events.roulette.start}
            </Button>
          ) : (
            <>
              {state.phase === 'collecting' && (
                <Button onClick={finishEarly} size="sm">
                  {t.events.roulette.finishEarly}
                </Button>
              )}
              <Button onClick={cancel} variant="outline" size="sm">
                {t.events.roulette.cancel}
              </Button>
            </>
          )}
          <span className="text-sm text-muted-foreground">{phaseLabel}</span>
        </div>

        {state.phase === 'collecting' && (
          <div className="flex items-center gap-2">
            <Input
              placeholder={t.events.roulette.namePlaceholder}
              className="w-48"
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void addManual()
              }}
            />
            <Button variant="outline" size="sm" onClick={addManual}>
              {t.events.roulette.addManual}
            </Button>
          </div>
        )}

        <div className="relative flex flex-col items-center gap-4 rounded-lg border border-border bg-card/50 p-4">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title={t.events.roulette.helpTitle}
                className="absolute top-2 right-2 flex size-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/50 text-[10px] font-bold leading-none text-muted-foreground transition-colors hover:border-foreground/50 hover:bg-accent hover:text-accent-foreground"
              >
                ?
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 text-xs leading-snug" side="left" align="start" sideOffset={8}>
              <p className="text-muted-foreground">{t.events.roulette.helpDescription}</p>
              <code className="mt-2 block overflow-x-auto rounded bg-muted p-2 whitespace-pre-wrap text-foreground">
                {t.events.roulette.helpFormula}
              </code>
            </PopoverContent>
          </Popover>

          <div className="flex w-full flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="flex w-56 shrink-0 flex-col gap-1.5">
              <Label>
                {t.events.roulette.entrants} ({state.entrants.length})
              </Label>
              {state.entrants.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.events.roulette.noEntrants}</p>
              ) : (
                <ScrollArea className="h-80">
                  <ul className="flex flex-col gap-1.5 pr-3">
                    {state.entrants.map((entrant, index) => {
                      const chance = totalWeight > 0 ? Math.round((entrant.weight / totalWeight) * 100) : 0
                      return (
                        <li
                          key={entrant.id}
                          className="flex min-w-0 items-center gap-1.5 rounded-full py-1 pr-1 pl-2.5 text-xs text-white"
                          style={{ backgroundColor: wheelSectorColor(index) }}
                          title={`${sourceLabel[entrant.source]} · ${chance}%`}
                        >
                          <span className="min-w-0 flex-1 truncate">{entrant.name}</span>
                          {entrant.weight > 1 && <span className="shrink-0 font-semibold">×{entrant.weight}</span>}
                          <span className="shrink-0 opacity-80">{chance}%</span>
                          {state.phase === 'collecting' && (
                            <button
                              type="button"
                              onClick={() => removeEntrant(entrant.id)}
                              aria-label={t.events.roulette.removeEntrant}
                              title={t.events.roulette.removeEntrant}
                              className="shrink-0 rounded-full p-0.5 hover:bg-black/20"
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </ScrollArea>
              )}
            </div>

            <div className="flex flex-col items-center gap-2">
              {state.phase !== 'idle' && (
                <div className="max-w-full truncate rounded-full bg-foreground px-3 py-1 text-sm font-semibold text-background shadow-sm">
                  {state.phase === 'collecting' && formatCountdown(secondsLeft)}
                  {state.phase === 'spinning' && (spinningName ?? t.events.roulette.choosingWinner)}
                  {state.phase === 'result' && state.winner?.name}
                </div>
              )}
              <RouletteWheel
                entrants={state.entrants}
                rotation={wheelRotation}
                winnerId={state.phase === 'result' ? (state.winner?.id ?? null) : null}
                animate={animateWheel}
                tracking={state.phase === 'spinning'}
                onTick={setSpinningName}
              />
            </div>
          </div>
        </div>

        {state.hash && (
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t.events.roulette.hashLabel}:</span>
              <CopyableValue value={state.hash} />
            </div>
            {state.seed && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t.events.roulette.seedLabel}:</span>
                <CopyableValue value={state.seed} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
