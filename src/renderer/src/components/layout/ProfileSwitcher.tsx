import { useEffect, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckIndicator,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useSidebar } from '@/components/ui/sidebar'
import { useI18n } from '@/providers/I18nProvider'
import { AVATAR_COLOR_CLASSES, profileInitials } from '@/lib/profile-avatar'
import { customImageUrl } from '@/lib/custom-image-url'
import { cn } from '@/lib/utils'
import { ManageProfilesDialog } from '@/components/layout/ManageProfilesDialog'
import type { Profile } from '@shared/profiles'
import type { OverlayUrls } from '@shared/types'

export function ProfileSwitcher() {
  const { t } = useI18n()
  const { state } = useSidebar()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
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
    void refresh()
    window.obscure.getOverlayUrls().then(setUrls)
  }, [])

  // The manage dialog can rename/recolor/add/delete profiles without
  // switching — resync the trigger + list once it closes.
  useEffect(() => {
    if (!manageOpen) void refresh()
  }, [manageOpen])

  const activeProfile = profiles.find((profile) => profile.id === activeId) ?? profiles[0]

  const handleSwitch = (id: string): void => {
    if (id === activeId) return
    void window.obscure.switchProfile(id)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-tour="app-logo"
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <Avatar className="size-6 shrink-0">
              {activeProfile && <AvatarImage src={customImageUrl(urls, activeProfile.avatarImage) ?? undefined} />}
              <AvatarFallback
                className={cn('text-[10px]', activeProfile && AVATAR_COLOR_CLASSES[activeProfile.avatarColor])}
              >
                {activeProfile ? profileInitials(activeProfile.name) : '?'}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
              {activeProfile?.name ?? ''}
            </span>
            <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side={state === 'collapsed' ? 'right' : 'bottom'} className="w-56">
          <DropdownMenuLabel>{t.profiles.menuLabel}</DropdownMenuLabel>
          {profiles.map((profile) => (
            <DropdownMenuItem key={profile.id} onSelect={() => handleSwitch(profile.id)}>
              <Avatar className="size-5">
                <AvatarImage src={customImageUrl(urls, profile.avatarImage) ?? undefined} />
                <AvatarFallback className={cn('text-[9px]', AVATAR_COLOR_CLASSES[profile.avatarColor])}>
                  {profileInitials(profile.name)}
                </AvatarFallback>
              </Avatar>
              <span className="flex-1 truncate">{profile.name}</span>
              {profile.id === activeId && <DropdownMenuCheckIndicator />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setManageOpen(true)}>{t.profiles.manage}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ManageProfilesDialog open={manageOpen} onOpenChange={setManageOpen} />
    </>
  )
}
