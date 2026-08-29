import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { SettingKey } from '@shared/types'

interface SettingToggleFieldProps {
  settingKey: SettingKey
  label: string
  description?: string
}

export function SettingToggleField({ settingKey, label, description }: SettingToggleFieldProps) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    window.maddoner.getSetting<boolean>(settingKey).then((stored) => setEnabled(Boolean(stored)))
  }, [settingKey])

  const toggle = (checked: boolean): void => {
    setEnabled(checked)
    void window.maddoner.setSetting(settingKey, checked)
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={settingKey}>{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={settingKey} checked={enabled} onCheckedChange={toggle} />
    </div>
  )
}
