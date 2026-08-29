import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTheme } from '@/providers/ThemeProvider'
import { useI18n } from '@/providers/I18nProvider'
import { BUILTIN_THEMES } from '@/lib/theme'
import { useCustomConfig } from '@/providers/CustomConfigProvider'

export function ThemeSelect() {
  const { t } = useI18n()
  const { preference, setPreference } = useTheme()
  const { customThemes } = useCustomConfig()

  return (
    <Select value={preference} onValueChange={setPreference}>
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="system">{t.theme.system}</SelectItem>
        {BUILTIN_THEMES.map((theme) => (
          <SelectItem key={theme.id} value={theme.id}>
            {theme.labelKey ? t.theme[theme.labelKey] : theme.name}
          </SelectItem>
        ))}
        {customThemes.map((theme) => (
          <SelectItem key={theme.id} value={theme.id}>
            {theme.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
