import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/providers/I18nProvider'
import type { SettingKey } from '@shared/types'

interface SettingTextFieldProps {
  settingKey: SettingKey
  label: string
  placeholder?: string
  description?: string
  type?: 'text' | 'password'
}

export function SettingTextField({
  settingKey,
  label,
  placeholder,
  description,
  type = 'text'
}: SettingTextFieldProps) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(false)
  // Masked by default for sensitive fields (client secrets, ...) — an eye
  // toggle reveals it in place rather than the browser's own password dots,
  // so it stays consistent regardless of platform/theme.
  const sensitive = type === 'password'
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    window.maddoner.getSetting<string>(settingKey).then((stored) => {
      if (stored) setValue(stored)
    })
  }, [settingKey])

  const save = (): void => {
    void window.maddoner.setSetting(settingKey, value).then(() => {
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={settingKey}>{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={settingKey}
            type={sensitive && !revealed ? 'password' : 'text'}
            value={value}
            placeholder={placeholder}
            className={sensitive ? 'pr-8' : undefined}
            onChange={(event) => setValue(event.target.value)}
          />
          {sensitive && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1/2 right-0.5 -translate-y-1/2"
              onClick={() => setRevealed((current) => !current)}
              aria-label={revealed ? t.common.hide : t.common.show}
              title={revealed ? t.common.hide : t.common.show}
            >
              {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
          )}
        </div>
        <Button onClick={save}>{saved ? t.common.saved : t.common.save}</Button>
      </div>
    </div>
  )
}
