import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CanvasSettingsForm } from '@/components/CanvasSettingsForm'
import { CollapsibleSection } from '@/components/CollapsibleSection'
import { OverlayAddressForm } from '@/components/OverlayAddressForm'
import { SettingToggleField } from '@/components/SettingToggleField'
import { AppearanceSettings } from '@/components/settings/AppearanceSettings'
import { useI18n } from '@/providers/I18nProvider'
import { useTour } from '@/providers/TourProvider'
import type { CanvasConfig } from '@shared/canvasConfig'
import type { OverlayUrls } from '@shared/types'

export function SettingsPage() {
  const { t } = useI18n()
  const { start: startTour } = useTour()
  const [overlayUrls, setOverlayUrls] = useState<OverlayUrls | null>(null)
  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig | null>(null)

  useEffect(() => {
    window.obscure.getOverlayUrls().then(setOverlayUrls)
    window.obscure.getCanvasConfig().then(setCanvasConfig)
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 min-[1440px]:max-w-none">
      <div>
        <h1 className="text-xl font-semibold">{t.settings.title}</h1>
        <p className="text-sm text-muted-foreground">{t.settings.description}</p>
      </div>

      {/* Two logical groups side by side from 1440px up: app-level prefs
          (appearance/window/help) vs. overlay-facing technical config
          (overlay address/canvas) — stacked back into one column below that. */}
      <div className="flex flex-col gap-6 min-[1440px]:flex-row min-[1440px]:items-start">
        <div className="flex flex-1 flex-col gap-6">
          <CollapsibleSection
            title={t.settings.appearance.title}
            level="h2"
            titleClassName="text-sm font-medium"
            className="gap-2"
          >
            <p className="text-xs text-muted-foreground">{t.settings.appearance.description}</p>
            <AppearanceSettings />
          </CollapsibleSection>

          <CollapsibleSection
            title={t.settings.window.title}
            level="h2"
            titleClassName="text-sm font-medium"
            className="gap-2"
          >
            <p className="text-xs text-muted-foreground">{t.settings.window.description}</p>
            <SettingToggleField
              settingKey="app.minimizeToTray"
              label={t.settings.window.minimizeToTrayLabel}
              description={t.settings.window.minimizeToTrayDescription}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title={t.settings.help.title}
            level="h2"
            titleClassName="text-sm font-medium"
            className="gap-2"
            tourId="restart-tour"
          >
            <p className="text-xs text-muted-foreground">{t.settings.help.description}</p>
            <Button variant="outline" onClick={() => startTour()} className="w-fit">
              {t.settings.help.restartTour}
            </Button>
            <p className="text-xs text-muted-foreground">{t.settings.help.sceneBuilderTourHint}</p>
          </CollapsibleSection>
        </div>

        <div className="flex flex-1 flex-col gap-6">
          <CollapsibleSection
            title={t.settings.overlayAddressTitle}
            level="h2"
            titleClassName="text-sm font-medium"
            className="gap-2"
            tourId="settings-overlay-address"
          >
            <p className="text-xs text-muted-foreground">{t.settings.overlayAddressDescription}</p>
            {overlayUrls ? (
              <OverlayAddressForm current={overlayUrls} onUpdated={setOverlayUrls} />
            ) : (
              <p className="text-sm text-muted-foreground">{t.common.loading}</p>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title={t.settings.canvas.title}
            level="h2"
            titleClassName="text-sm font-medium"
            className="gap-2"
            tourId="settings-canvas"
          >
            <p className="text-xs text-muted-foreground">{t.settings.canvas.description}</p>
            {canvasConfig ? (
              <CanvasSettingsForm current={canvasConfig} onUpdated={setCanvasConfig} />
            ) : (
              <p className="text-sm text-muted-foreground">{t.common.loading}</p>
            )}
          </CollapsibleSection>
        </div>
      </div>
    </div>
  )
}
