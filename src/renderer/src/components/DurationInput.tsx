import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/providers/I18nProvider'

export type DurationUnitId = 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks'

export const DURATION_UNIT_IDS: DurationUnitId[] = ['seconds', 'minutes', 'hours', 'days', 'weeks']

export const DURATION_UNIT_SECONDS: Record<DurationUnitId, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
  weeks: 604800
}

export function pickDurationUnit(seconds: number): DurationUnitId {
  for (let i = DURATION_UNIT_IDS.length - 1; i >= 0; i--) {
    const unit = DURATION_UNIT_IDS[i]
    const unitSeconds = DURATION_UNIT_SECONDS[unit]
    if (seconds >= unitSeconds && seconds % unitSeconds === 0) return unit
  }
  return 'seconds'
}

export interface DurationInputProps {
  id: string
  seconds: number
  onChange: (seconds: number) => void
  min: number
  max: number
}

export function DurationInput({ id, seconds, onChange, min, max }: DurationInputProps): React.JSX.Element {
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
