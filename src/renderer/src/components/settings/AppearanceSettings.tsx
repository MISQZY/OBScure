import { useState } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ThemeSelect } from '@/components/settings/ThemeSelect'
import { LocaleSelect } from '@/components/settings/LocaleSelect'
import { useI18n } from '@/providers/I18nProvider'
import { useCustomConfig } from '@/providers/CustomConfigProvider'
import { interpolate } from '@/lib/i18n/interpolate'

export function AppearanceSettings() {
  const { t } = useI18n()
  const s = t.settings.appearance
  const {
    customThemes,
    customLocales,
    uploadTheme,
    uploadLocale,
    deleteCustomTheme,
    deleteCustomLocale,
    downloadExampleTheme,
    downloadExampleLocale
  } = useCustomConfig()
  const [uploadingTheme, setUploadingTheme] = useState(false)
  const [uploadingLocale, setUploadingLocale] = useState(false)

  const handleUploadTheme = async (): Promise<void> => {
    setUploadingTheme(true)
    try {
      const result = await uploadTheme()
      if (result === 'invalid') window.alert(s.invalidThemeFile)
    } finally {
      setUploadingTheme(false)
    }
  }

  const handleUploadLocale = async (): Promise<void> => {
    setUploadingLocale(true)
    try {
      const result = await uploadLocale()
      if (result === 'invalid') window.alert(s.invalidLocaleFile)
    } finally {
      setUploadingLocale(false)
    }
  }

  const handleDeleteTheme = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(interpolate(s.deleteConfirm, { name }))) return
    await deleteCustomTheme(id)
  }

  const handleDeleteLocale = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(interpolate(s.deleteConfirm, { name }))) return
    await deleteCustomLocale(id)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>{s.themeLabel}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeSelect />
          <Button type="button" variant="outline" size="sm" onClick={() => void downloadExampleTheme()}>
            <Download className="size-3.5" />
            {s.downloadExample}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleUploadTheme} disabled={uploadingTheme}>
            <Upload className="size-3.5" />
            {uploadingTheme ? s.uploading : s.upload}
          </Button>
        </div>

        {customThemes.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-1">
            <p className="text-xs font-medium text-muted-foreground">{s.customThemesTitle}</p>
            <ul className="flex flex-col gap-1">
              {customThemes.map((theme) => (
                <li key={theme.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                  <span>{theme.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={s.deleteCustom}
                    onClick={() => void handleDeleteTheme(theme.id, theme.name ?? theme.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>{s.localeLabel}</Label>
        <div className="flex flex-wrap items-center gap-2">
          <LocaleSelect />
          <Button type="button" variant="outline" size="sm" onClick={() => void downloadExampleLocale()}>
            <Download className="size-3.5" />
            {s.downloadExample}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleUploadLocale} disabled={uploadingLocale}>
            <Upload className="size-3.5" />
            {uploadingLocale ? s.uploading : s.upload}
          </Button>
        </div>

        {customLocales.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-1">
            <p className="text-xs font-medium text-muted-foreground">{s.customLocalesTitle}</p>
            <ul className="flex flex-col gap-1">
              {customLocales.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                  <span>{entry.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={s.deleteCustom}
                    onClick={() => void handleDeleteLocale(entry.id, entry.name)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
