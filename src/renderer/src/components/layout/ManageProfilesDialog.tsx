import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useI18n } from '@/providers/I18nProvider'
import { interpolate } from '@/lib/i18n/interpolate'
import { AVATAR_COLOR_CLASSES, profileInitials } from '@/lib/profile-avatar'
import { cn } from '@/lib/utils'
import { AVATAR_COLORS, MAX_PROFILES, type Profile } from '@shared/profiles'

interface ManageProfilesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManageProfilesDialog({ open, onOpenChange }: ManageProfilesDialogProps) {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    const [list, active] = await Promise.all([
      window.maddoner.getProfiles(),
      window.maddoner.getActiveProfileId()
    ])
    setProfiles(list)
    setActiveId(active)
  }

  useEffect(() => {
    if (open) void refresh()
  }, [open])

  const handleRename = async (profile: Profile, name: string): Promise<void> => {
    if (!name.trim() || name === profile.name) return
    await window.maddoner.renameProfile(profile.id, name)
    void refresh()
  }

  const handleCycleColor = async (profile: Profile): Promise<void> => {
    const index = AVATAR_COLORS.indexOf(profile.avatarColor)
    const next = AVATAR_COLORS[(index + 1) % AVATAR_COLORS.length]
    await window.maddoner.setProfileAvatarColor(profile.id, next)
    void refresh()
  }

  const handleSwitch = async (profile: Profile): Promise<void> => {
    if (profile.id === activeId) return
    setBusyId(profile.id)
    await window.maddoner.switchProfile(profile.id)
  }

  const handleDelete = async (profile: Profile): Promise<void> => {
    if (profiles.length <= 1) return
    const message = interpolate(t.profiles.deleteConfirm, { name: profile.name })
    if (!window.confirm(message)) return
    setBusyId(profile.id)
    await window.maddoner.deleteProfile(profile.id)
    if (profile.id !== activeId) {
      setBusyId(null)
      void refresh()
    }
  }

  const handleAdd = async (): Promise<void> => {
    await window.maddoner.createProfile('')
    void refresh()
  }

  const atMax = profiles.length >= MAX_PROFILES

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.profiles.dialogTitle}</DialogTitle>
          <DialogDescription>
            {interpolate(t.profiles.dialogDescription, { max: String(MAX_PROFILES) })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {profiles.map((profile) => {
            const isActive = profile.id === activeId
            const isBusy = busyId === profile.id
            return (
              <div
                key={profile.id}
                className="flex items-center gap-2 rounded-lg border border-border p-2"
              >
                <button
                  type="button"
                  onClick={() => void handleCycleColor(profile)}
                  title={t.profiles.changeAvatarColor}
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar className="size-9">
                    <AvatarFallback className={AVATAR_COLOR_CLASSES[profile.avatarColor]}>
                      {profileInitials(profile.name)}
                    </AvatarFallback>
                  </Avatar>
                </button>

                <Input
                  key={profile.id + profile.name}
                  defaultValue={profile.name}
                  placeholder={t.profiles.namePlaceholder}
                  className="flex-1"
                  onBlur={(event) => void handleRename(profile, event.target.value)}
                />

                {isActive ? (
                  <span className="px-2 text-xs whitespace-nowrap text-muted-foreground">{t.profiles.active}</span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => void handleSwitch(profile)}
                  >
                    {t.profiles.switchAction}
                  </Button>
                )}

                <Button
                  size="icon-sm"
                  variant="ghost"
                  title={t.profiles.deleteTooltip}
                  disabled={profiles.length <= 1 || isBusy}
                  onClick={() => void handleDelete(profile)}
                >
                  <Trash2 className={cn('text-destructive')} />
                </Button>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={atMax} onClick={() => void handleAdd()}>
            {atMax ? interpolate(t.profiles.maxReached, { max: String(MAX_PROFILES) }) : t.profiles.addProfile}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
