import { useEffect, useState } from 'react'
import { Proportions } from 'lucide-react'
import { Label, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@/components/ui'
import { NumberInput } from '@/components/nodes/utils/NumberInput'
import { cn } from '@/lib/utils'
import { useI18n } from '@/providers/I18nProvider'
import { interpolate } from '@/lib/i18n/interpolate'
import { ASPECT_RATIO_IDS, ASPECT_RATIO_VALUES, type AspectRatioId, type CanvasConfig } from '@shared/canvasConfig'

/** Styled like ui/input.tsx's Input (border/bg/rounding/height as one box) rather than the compact numberInputClass node property panels use — this popover sits in the app chrome, not a node body. */
const canvasNumberInputClass =
  'h-8 rounded-lg border border-input bg-muted px-2.5 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50'

/**
 * Header control for this scene's own reference canvas size (see
 * shared/canvasConfig.ts) — independent of every other scene. `overlayConfig`
 * undefined means this scene has no override yet and inherits
 * `defaultConfig` (the app-wide Settings → Canvas value); flipping the
 * switch on seeds the override from that default so the fields never start
 * out blank, and flipping it back off clears the override entirely rather
 * than just hiding it.
 */
export function SceneCanvasSizeButton({
  overlayConfig,
  defaultConfig,
  onChange
}: {
  overlayConfig: CanvasConfig | undefined
  defaultConfig: CanvasConfig
  onChange: (config: CanvasConfig | undefined) => void
}) {
  const { t } = useI18n()
  const isCustom = overlayConfig !== undefined
  const effective = overlayConfig ?? defaultConfig

  const [aspectRatio, setAspectRatio] = useState<AspectRatioId>(effective.aspectRatio)

  // Re-syncs the select whenever the SAVED override (or, while there's none,
  // the fallback default) changes from outside this popover — switching to a
  // different scene, or another client updating Settings → Canvas. Width/
  // height need no equivalent: NumberInput takes effective.width/height
  // directly as its own controlled `value`.
  useEffect(() => {
    setAspectRatio(effective.aspectRatio)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayConfig, defaultConfig])

  const labels: Record<AspectRatioId, string> = {
    '16:9': '16:9',
    '9:16': '9:16',
    '4:3': '4:3',
    '3:4': '3:4',
    '1:1': '1:1',
    custom: t.settings.canvas.customRatio
  }

  const commit = (next: Partial<CanvasConfig>): void => {
    const merged: CanvasConfig = { ...effective, ...next }
    if (!Number.isFinite(merged.width) || merged.width <= 0) return
    if (!Number.isFinite(merged.height) || merged.height <= 0) return
    onChange({ width: Math.round(merged.width), height: Math.round(merged.height), aspectRatio: merged.aspectRatio })
  }

  const applyRatio = (ratio: AspectRatioId): void => {
    setAspectRatio(ratio)
    if (ratio === 'custom') {
      commit({ aspectRatio: ratio })
      return
    }
    commit({ aspectRatio: ratio, height: Math.round(effective.width / ASPECT_RATIO_VALUES[ratio]) })
  }

  const onWidthChange = (next: number | null): void => {
    if (next === null) return
    if (aspectRatio === 'custom') {
      commit({ width: next })
      return
    }
    commit({ width: next, height: Math.round(next / ASPECT_RATIO_VALUES[aspectRatio]) })
  }

  const onHeightChange = (next: number | null): void => {
    if (next !== null) commit({ height: next })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t.sceneBuilder.canvasSize.button}
          className={cn(
            'flex items-center justify-center p-2 rounded-md border transition-colors',
            isCustom
              ? 'border-primary/40 text-primary hover:bg-primary/10'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Proportions className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t.sceneBuilder.canvasSize.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t.sceneBuilder.canvasSize.description}</p>
          </div>

          <label className="flex items-center justify-between gap-2 text-sm text-foreground">
            {t.sceneBuilder.canvasSize.useCustom}
            <Switch checked={isCustom} onCheckedChange={(checked) => onChange(checked ? { ...defaultConfig } : undefined)} />
          </label>

          {isCustom ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="scene-canvas-aspect-ratio">{t.settings.canvas.aspectRatioLabel}</Label>
                <Select value={aspectRatio} onValueChange={(next) => applyRatio(next as AspectRatioId)}>
                  <SelectTrigger id="scene-canvas-aspect-ratio" className="w-full">
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
              {/* grid, not flex-wrap: the popover (w-72) is too narrow for
                  three side-by-side fields, so Width/Height need their own
                  row — grid-cols-2 keeps that row from wrapping the two
                  fields onto separate lines the way flex-wrap did. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label>{t.settings.canvas.widthLabel}</Label>
                  <NumberInput
                    value={effective.width}
                    onChange={onWidthChange}
                    min={1}
                    max={16384}
                    className={canvasNumberInputClass}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t.settings.canvas.heightLabel}</Label>
                  <NumberInput
                    value={effective.height}
                    onChange={onHeightChange}
                    min={1}
                    max={16384}
                    disabled={aspectRatio !== 'custom'}
                    className={canvasNumberInputClass}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {interpolate(t.sceneBuilder.canvasSize.usingDefault, {
                size: `${defaultConfig.width} × ${defaultConfig.height}`
              })}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
