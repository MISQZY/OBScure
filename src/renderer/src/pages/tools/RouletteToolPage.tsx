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
import { DurationInput } from '@/components/DurationInput'
import { RouletteWheel, wheelSectorColor, WHEEL_EXTRA_SPINS } from './RouletteWheel'
import {
  DEFAULT_ROULETTE_CONFIG,
  MAX_ROULETTE_DURATION_SECONDS,
  MIN_ROULETTE_DURATION_SECONDS,
  type RouletteConfig,
  type RouletteEntryMode
} from '@shared/eventsConfig'
import type { RouletteStatePayload, TwitchCustomReward } from '@shared/types'

const IDLE_STATE: RouletteStatePayload = { phase: 'idle', entrants: [], endsAt: null, winner: null, hash: null, seed: null }
const NONE_VALUE = '__none__'

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
  const positionedWinnerIdRef = useRef<string | null>(null)

  useEffect(() => {
    window.obscure.getEventsConfig('roulette').then(setConfig)
    window.obscure.getRouletteState().then(setState)
    window.obscure.getTwitchRewards().then(setRewards)
    return window.obscure.onRouletteState(setState)
  }, [])

  useEffect(() => {
    if (state.phase !== 'collecting') return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [state.phase])

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
    const normalized = await window.obscure.setEventsConfig('roulette', config)
    setConfig(normalized)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const start = async (): Promise<void> => {
    setState(await window.obscure.startRoulette(config.durationSeconds))
  }

  const cancel = async (): Promise<void> => {
    setState(await window.obscure.cancelRoulette())
  }

  const finishEarly = async (): Promise<void> => {
    setState(await window.obscure.finishRouletteEarly())
  }

  const addManual = async (): Promise<void> => {
    if (!manualName.trim()) return
    setState(await window.obscure.addRouletteEntrant(manualName))
    setManualName('')
  }

  const removeEntrant = async (id: string): Promise<void> => {
    setState(await window.obscure.removeRouletteEntrant(id))
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
