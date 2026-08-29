import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/providers/I18nProvider'
import {
  ASPECT_RATIO_IDS,
  ASPECT_RATIO_VALUES,
  type AspectRatioId,
  type CanvasConfig
} from '@shared/canvasConfig'

interface CanvasSettingsFormProps {
  current: CanvasConfig
  onUpdated: (config: CanvasConfig) => void
}

/** Bounding box, in px, that the live shape preview scales into (see previewSize below). */
const PREVIEW_BOX = 72

/** Fits a width/height ratio into a PREVIEW_BOX square, preserving orientation (landscape/portrait/square). */
function previewSize(ratio: number): { width: number; height: number } {
  return ratio >= 1
    ? { width: PREVIEW_BOX, height: PREVIEW_BOX / ratio }
    : { width: PREVIEW_BOX * ratio, height: PREVIEW_BOX }
}

export function CanvasSettingsForm({ current, onUpdated }: CanvasSettingsFormProps) {
  const { t } = useI18n()
  const labels: Record<AspectRatioId, string> = {
    '16:9': '16:9',
    '9:16': '9:16',
    '4:3': '4:3',
    '3:4': '3:4',
    '1:1': '1:1',
    custom: t.settings.canvas.customRatio
  }

  const [width, setWidth] = useState(String(current.width))
  const [height, setHeight] = useState(String(current.height))
  const [aspectRatio, setAspectRatio] = useState<AspectRatioId>(current.aspectRatio)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setWidth(String(current.width))
    setHeight(String(current.height))
    setAspectRatio(current.aspectRatio)
  }, [current.width, current.height, current.aspectRatio])

  const applyRatio = (ratio: AspectRatioId, fromWidth: number): void => {
    setAspectRatio(ratio)
    if (ratio === 'custom') return
    const computedHeight = Math.round(fromWidth / ASPECT_RATIO_VALUES[ratio])
    if (Number.isFinite(computedHeight) && computedHeight > 0) setHeight(String(computedHeight))
  }

  const onWidthChange = (next: string): void => {
    setWidth(next)
    if (aspectRatio === 'custom') return
    const widthNumber = Number(next)
    if (!Number.isFinite(widthNumber) || widthNumber <= 0) return
    setHeight(String(Math.round(widthNumber / ASPECT_RATIO_VALUES[aspectRatio])))
  }

  const widthNumber = Number(width)
  const heightNumber = Number(height)
  const hasValidSize = Number.isFinite(widthNumber) && widthNumber > 0 && Number.isFinite(heightNumber) && heightNumber > 0
  const shape = previewSize(hasValidSize ? widthNumber / heightNumber : 16 / 9)

  const save = async (): Promise<void> => {
    if (!hasValidSize) return

    setPending(true)
    try {
      const config = await window.maddoner.setCanvasConfig({
        width: Math.round(widthNumber),
        height: Math.round(heightNumber),
        aspectRatio
      })
      onUpdated(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="canvas-aspect-ratio">{t.settings.canvas.aspectRatioLabel}</Label>
          <Select value={aspectRatio} onValueChange={(next) => applyRatio(next as AspectRatioId, Number(width))}>
            <SelectTrigger id="canvas-aspect-ratio" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIO_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {labels[id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="canvas-width">{t.settings.canvas.widthLabel}</Label>
          <Input
            id="canvas-width"
            type="number"
            min={1}
            max={16384}
            className="w-24"
            value={width}
            onChange={(event) => onWidthChange(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="canvas-height">{t.settings.canvas.heightLabel}</Label>
          <Input
            id="canvas-height"
            type="number"
            min={1}
            max={16384}
            className="w-24"
            disabled={aspectRatio !== 'custom'}
            value={height}
            onChange={(event) => setHeight(event.target.value)}
          />
        </div>
        <Button onClick={save} disabled={pending}>
          {saved ? t.common.saved : t.common.save}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="flex shrink-0 items-center justify-center rounded-md border border-border bg-muted"
          style={{ width: PREVIEW_BOX, height: PREVIEW_BOX }}
        >
          <div
            className="rounded-sm border border-border bg-background"
            style={{ width: shape.width, height: shape.height }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {hasValidSize ? `${Math.round(widthNumber)} × ${Math.round(heightNumber)}` : t.settings.canvas.invalidSize}
        </p>
      </div>
    </div>
  )
}
