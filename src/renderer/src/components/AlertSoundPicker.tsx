import { useRef, useState } from 'react'
import { Pause, Play, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useI18n } from '@/providers/I18nProvider'
import { PRESET_SOUND_IDS, type PresetSoundId, type SoundId } from '@shared/sounds'

interface AlertSoundPickerProps {
  idPrefix: string
  soundId: SoundId
  customSoundName: string | null
  soundVolume: number
  /** Base URL of the overlay HTTP server (http://host:port) — used to build playback URLs for local preview. */
  baseUrl: string
  onChange: (patch: { soundId?: SoundId; customSoundName?: string | null; soundVolume?: number }) => void
}

/** Lets a user pick a bundled preset alert sound, upload their own, preview it, and set its volume. */
export function AlertSoundPicker({
  idPrefix,
  soundId,
  customSoundName,
  soundVolume,
  baseUrl,
  onChange
}: AlertSoundPickerProps) {
  const { t } = useI18n()
  const s = t.sound
  const [playing, setPlaying] = useState(false)
  const [uploading, setUploading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const presetLabels: Record<PresetSoundId, string> = {
    chime: s.presets.chime,
    coin: s.presets.coin,
    pop: s.presets.pop,
    notify: s.presets.notify
  }

  const soundUrl =
    soundId === 'none'
      ? null
      : soundId === 'custom'
        ? customSoundName
          ? `${baseUrl}/overlays/custom-sounds/${encodeURIComponent(customSoundName)}`
          : null
        : `${baseUrl}/overlays/sounds/${soundId}.wav`

  const stopPreview = (): void => {
    audioRef.current?.pause()
    audioRef.current = null
    setPlaying(false)
  }

  const togglePreview = (): void => {
    if (playing) {
      stopPreview()
      return
    }
    if (!soundUrl) return
    const audio = new Audio(soundUrl)
    audio.volume = soundVolume
    audio.onended = () => setPlaying(false)
    audioRef.current = audio
    setPlaying(true)
    void audio.play().catch(() => setPlaying(false))
  }

  const upload = async (): Promise<void> => {
    setUploading(true)
    try {
      const result = await window.obscure.uploadCustomSound(soundId === 'custom' ? customSoundName : null)
      if (result) {
        stopPreview()
        onChange({ soundId: 'custom', customSoundName: result.fileName })
      }
    } finally {
      setUploading(false)
    }
  }

  const removeCustom = async (): Promise<void> => {
    if (!customSoundName) return
    stopPreview()
    await window.obscure.removeCustomSound(customSoundName)
    onChange({ soundId: 'none', customSoundName: null })
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${idPrefix}-sound`}>{s.label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={soundId}
          onValueChange={(next) => {
            stopPreview()
            onChange({ soundId: next as SoundId })
          }}
        >
          <SelectTrigger id={`${idPrefix}-sound`} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{s.none}</SelectItem>
            {PRESET_SOUND_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {presetLabels[id]}
              </SelectItem>
            ))}
            {customSoundName && <SelectItem value="custom">{s.customLabel}</SelectItem>}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={!soundUrl}
          onClick={togglePreview}
          aria-label={playing ? s.stopPreview : s.playPreview}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>

        <Button type="button" variant="outline" size="sm" onClick={upload} disabled={uploading}>
          <Upload className="size-3.5" />
          {uploading ? s.uploading : s.upload}
        </Button>

        {soundId === 'custom' && customSoundName && (
          <Button type="button" variant="ghost" size="icon" onClick={removeCustom} aria-label={s.removeCustom}>
            <X className="size-4" />
          </Button>
        )}
      </div>

      {soundId !== 'none' && (
        <div className="flex items-center gap-2">
          <Label htmlFor={`${idPrefix}-volume`} className="w-16 shrink-0">
            {s.volume}
          </Label>
          <Slider
            id={`${idPrefix}-volume`}
            className="w-40"
            min={0}
            max={100}
            value={[Math.round(soundVolume * 100)]}
            onValueChange={([next]) => onChange({ soundVolume: next / 100 })}
          />
          <span className="w-9 shrink-0 text-right text-xs text-muted-foreground">
            {Math.round(soundVolume * 100)}%
          </span>
        </div>
      )}
    </div>
  )
}
