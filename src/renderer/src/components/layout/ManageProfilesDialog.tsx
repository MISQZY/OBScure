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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useI18n } from '@/providers/I18nProvider'
import { interpolate } from '@/lib/i18n/interpolate'
import { AVATAR_COLOR_CLASSES, profileInitials } from '@/lib/profile-avatar'
import { customImageUrl } from '@/lib/custom-image-url'
import { cn } from '@/lib/utils'
import { AVATAR_COLORS, MAX_PROFILES, type Profile } from '@shared/profiles'
import type { OverlayUrls } from '@shared/types'

interface ManageProfilesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManageProfilesDialog({ open, onOpenChange }: ManageProfilesDialogProps) {
  const { t } = useI18n()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [urls, setUrls] = useState<OverlayUrls | null>(null)

  const refresh = async (): Promise<void> => {
    const [list, active] = await Promise.all([
      window.obscure.getProfiles(),
      window.obscure.getActiveProfileId()
    ])
    setProfiles(list)
    setActiveId(active)
  }

  useEffect(() => {
    if (open) void refresh()
  }, [open])

  useEffect(() => {
    window.obscure.getOverlayUrls().then(setUrls)
  }, [])

  const handleRename = async (profile: Profile, name: string): Promise<void> => {
    if (!name.trim() || name === profile.name) return
    await window.obscure.renameProfile(profile.id, name)
    void refresh()
  }

  const handleCycleColor = async (profile: Profile): Promise<void> => {
    const index = AVATAR_COLORS.indexOf(profile.avatarColor)
    const next = AVATAR_COLORS[(index + 1) % AVATAR_COLORS.length]
    await window.obscure.setProfileAvatarColor(profile.id, next)
    void refresh()
  }

  // uploadCustomImage deletes the previous file itself once the new one is copied in, so
  // replacing an existing avatar doesn't leave the old file behind.
  const handleUploadAvatar = async (profile: Profile): Promise<void> => {
    const result = await window.obscure.uploadCustomImage(profile.avatarImage ?? null)
    if (!result) return
    await window.obscure.setProfileAvatarImage(profile.id, result.fileName)
    void refresh()
  }

  const handleRemoveAvatar = async (profile: Profile): Promise<void> => {
    if (!profile.avatarImage) return
    await window.obscure.removeCustomImage(profile.avatarImage)
    await window.obscure.setProfileAvatarImage(profile.id, null)
    void refresh()
  }

  const handleSwitch = async (profile: Profile): Promise<void> => {
    if (profile.id === activeId) return
    setBusyId(profile.id)
    try {
      await window.obscure.switchProfile(profile.id)
    } catch {
      setBusyId(null)
    }
  }

  const handleDelete = async (profile: Profile): Promise<void> => {
    if (profiles.length <= 1) return
    setBusyId(profile.id)
    try {
      await window.obscure.deleteProfile(profile.id)
      if (profile.id !== activeId) {
        setBusyId(null)
        void refresh()
      }
    } catch {
      setBusyId(null)
    }
  }

  const handleAdd = async (): Promise<void> => {
    await window.obscure.createProfile('')
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title={t.profiles.avatarMenuLabel}
                      className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Avatar className="size-9">
                        <AvatarImage src={customImageUrl(urls, profile.avatarImage) ?? undefined} />
                        <AvatarFallback className={AVATAR_COLOR_CLASSES[profile.avatarColor]}>
                          {profileInitials(profile.name)}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={() => void handleUploadAvatar(profile)}>
                      {t.profiles.uploadAvatar}
                    </DropdownMenuItem>
                    {profile.avatarImage && (
                      <DropdownMenuItem onSelect={() => void handleRemoveAvatar(profile)}>
                        {t.profiles.removeAvatar}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => void handleCycleColor(profile)}>
                      {t.profiles.changeAvatarColor}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

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

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title={t.profiles.deleteTooltip}
                      disabled={profiles.length <= 1 || isBusy}
                    >
                      <Trash2 className={cn('text-destructive')} />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogTitle>
                      {interpolate(t.profiles.deleteConfirm, { name: profile.name })}
                    </AlertDialogTitle>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void handleDelete(profile)}>
                        {t.common.delete}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
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
