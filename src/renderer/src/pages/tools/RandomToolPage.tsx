import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CopyableValue } from '@/components/CopyableValue'
import { useI18n } from '@/providers/I18nProvider'
import { DEFAULT_RANDOM_CONFIG, type RandomConfig } from '@shared/eventsConfig'
import type { RandomStatePayload } from '@shared/types'

function SlotMachineNumber({ targetNumber, min, max, stopDelayMs }: { targetNumber: number, min: number, max: number, stopDelayMs: number }) {
  const [rolling, setRolling] = useState(true)
  const [strip] = useState<number[]>(() => {
    const arr = [targetNumber]
    for (let i = 0; i < 40; i++) {
      arr.push(min + Math.floor(Math.random() * (max - min + 1)))
    }
    return arr
  })

  useEffect(() => {
    const t = setTimeout(() => {
      setRolling(false)
    }, 50)

    return () => clearTimeout(t)
  }, [])
  const maxChars = Math.max(min.toString().length, max.toString().length)

  return (
    <div 
      className="relative overflow-hidden h-[54px] inline-flex justify-center items-start px-2.5 bg-muted/30 rounded-md text-center font-mono ring-1 ring-border shadow-inner text-3xl font-bold"
      style={{ width: `calc(${maxChars}ch + 1.25rem)` }}
    >
      <div 
        className="flex flex-col transition-transform w-full"
        style={{ 
          transform: rolling ? `translateY(-${(strip.length - 1) * 54}px)` : `translateY(0)`,
          transitionDuration: rolling ? '0ms' : `${stopDelayMs}ms`,
          transitionTimingFunction: 'cubic-bezier(0.15, 0.85, 0.35, 1)' // smooth deceleration
        }}
      >
        {strip.map((n, i) => (
          <div key={i} className="h-[54px] flex-shrink-0 flex items-center justify-center leading-none">{n}</div>
        ))}
      </div>
    </div>
  )
}

const IDLE_STATE: RandomStatePayload = {
  phase: 'idle',
  hash: null,
  numbers: null,
  seed: null,
  min: DEFAULT_RANDOM_CONFIG.min,
  max: DEFAULT_RANDOM_CONFIG.max,
  count: DEFAULT_RANDOM_CONFIG.count
}

/** Internal tool, no Browser Source of its own — the result only shows here in the app. */
export function RandomToolPage() {
  const { t } = useI18n()
  const [config, setConfig] = useState<RandomConfig>(DEFAULT_RANDOM_CONFIG)
  const [saved, setSaved] = useState(false)
  const [state, setState] = useState<RandomStatePayload>(IDLE_STATE)

  useEffect(() => {
    window.maddoner.getEventsConfig('random').then(setConfig)
  }, [])

  const save = async (): Promise<void> => {
    const normalized = await window.maddoner.setEventsConfig('random', config)
    setConfig(normalized)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const roll = async (): Promise<void> => {
    setState(await window.maddoner.commitRandomRoll(config.min, config.max, config.count))
  }

  const reveal = async (): Promise<void> => {
    setState(await window.maddoner.revealRandomRoll())
  }

  return (
    <div className="flex max-w-full xl:max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.events.random.title}</h1>
        <p className="text-sm text-muted-foreground">{t.events.random.description}</p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="random-min">{t.events.random.minLabel}</Label>
          <Input
            id="random-min"
            type="number"
            className="w-24"
            value={config.min}
            onChange={(event) => setConfig((c) => ({ ...c, min: Number(event.target.value) }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="random-max">{t.events.random.maxLabel}</Label>
          <Input
            id="random-max"
            type="number"
            className="w-24"
            value={config.max}
            onChange={(event) => setConfig((c) => ({ ...c, max: Number(event.target.value) }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="random-count">{t.events.random.countLabel || 'Количество'}</Label>
          <Input
            id="random-count"
            type="number"
            min={1}
            max={10}
            className="w-24"
            value={config.count}
            onChange={(event) => setConfig((c) => ({ ...c, count: Number(event.target.value) }))}
          />
        </div>
        <Button onClick={save} variant="outline">
          {saved ? t.common.saved : t.common.save}
        </Button>
      </div>

      <div className="min-h-[250px] rounded-md border bg-card p-6 flex flex-col">
        <div className="flex flex-col gap-4 text-sm flex-1">
          <div className="grid place-items-center rounded-md border bg-muted/10 p-3 min-h-[80px] mx-auto w-fit">
            {state.numbers !== null ? (
              <div className="col-start-1 row-start-1 flex flex-wrap justify-center gap-3">
                {state.numbers.map((n, i) => (
                  <SlotMachineNumber 
                    key={i} 
                    targetNumber={n} 
                    min={state.min} 
                    max={state.max} 
                    stopDelayMs={1500 + i * 400} 
                  />
                ))}
              </div>
            ) : (
              <>
                <div className="col-start-1 row-start-1 invisible flex flex-wrap justify-center gap-3" aria-hidden="true">
                  {Array.from({ length: config.count }).map((_, i) => (
                    <div 
                      key={i} 
                      className="h-[54px] px-2.5 text-3xl font-mono font-bold" 
                      style={{ width: `calc(${Math.max(config.min.toString().length, config.max.toString().length)}ch + 1.25rem)` }}
                    />
                  ))}
                </div>
                <div className="col-start-1 row-start-1 text-muted-foreground italic text-xs text-center">
                  {t.events.random.notCalculated}
                </div>
              </>
            )}
          </div>
          
          <div className="flex flex-col gap-2 mt-auto">
            <div className="mb-2 flex items-center justify-center gap-3">
              {(state.phase === 'idle' || state.phase === 'revealed') && (
                <Button onClick={roll} variant={state.phase === 'revealed' ? 'outline' : 'default'} size="sm">
                  {state.phase === 'revealed' ? t.events.random.newRound : t.events.random.roll}
                </Button>
              )}
              {state.phase === 'committed' && (
                <Button onClick={reveal} size="sm">
                  {t.events.random.reveal}
                </Button>
              )}
            </div>
            
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t.events.random.hashLabel}:</span>
                {state.hash ? <CopyableValue value={state.hash} /> : <span className="text-muted-foreground italic text-xs">{t.events.random.notCalculated}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t.events.random.seedLabel}:</span>
                {state.seed ? <CopyableValue value={state.seed} /> : <span className="text-muted-foreground italic text-xs">{t.events.random.notCalculated}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">{t.events.random.verifyHint}</p>
      </div>
    </div>
  )
}
