import { useEffect, useState } from 'react'
import { ChevronRight, Download, LayoutDashboard, Layers, Plug, Settings, Workflow, Wrench, Plus, Trash2 } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem
} from '@/components/ui/sidebar'
import { ProfileSwitcher } from '@/components/layout/ProfileSwitcher'
import { cn } from '@/lib/utils'
import type { NavKey } from '@/lib/nav'
import { INTEGRATION_KEYS, INTEGRATIONS_META } from '@/lib/integrations-meta'
import { EVENT_KEYS, EVENTS_META, eventLabels } from '@/lib/events-meta'
import { useI18n } from '@/providers/I18nProvider'
import { useCustomOverlays } from '@/providers/CustomOverlaysProvider'
import { uniqueUrlKey } from '@/lib/custom-overlays'
import { useAppUpdater } from '@/hooks/use-app-updater'
import { interpolate } from '@/lib/i18n/interpolate'

const RELEASES_URL = 'https://github.com/MISQZY/OBScure/releases'

interface AppSidebarProps {
  active: NavKey
  onNavigate: (key: NavKey) => void
}

export function AppSidebar({ active, onNavigate }: AppSidebarProps) {
  const { t } = useI18n()
  const eventLabelsByKey = eventLabels(t)
  const [toolsOpen, setToolsOpen] = useState(true)
  const [integrationsOpen, setIntegrationsOpen] = useState(true)
  const [overlaysOpen, setOverlaysOpen] = useState(true)
  const { overlays, saveOverlay, deleteOverlay } = useCustomOverlays()

  const isToolsActive = active.startsWith('tools/')
  const isIntegrationsActive = active.startsWith('integrations/')

  const [isCreatingOverlay, setIsCreatingOverlay] = useState(false)
  const [newOverlayName, setNewOverlayName] = useState("")
  const [appVersion, setAppVersion] = useState("")
  const [updaterStatus, downloadUpdate] = useAppUpdater()

  useEffect(() => {
    window.maddoner.getAppVersion().then(setAppVersion)
  }, [])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <ProfileSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu data-tour="sidebar-nav">
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === 'dashboard'}
                  tooltip={t.sidebar.dashboard}
                  onClick={() => onNavigate('dashboard')}
                >
                  <LayoutDashboard />
                  <span>{t.sidebar.dashboard}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={active.startsWith('overlays/custom') && !overlaysOpen}
                  tooltip={t.sidebar.overlays}
                >
                  <div
                    className="flex w-full items-center cursor-pointer"
                    onClick={() => setOverlaysOpen((open) => !open)}
                  >
                    <Layers className="mr-2" />
                    <span>{t.sidebar.overlays}</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setOverlaysOpen(true)
                        setIsCreatingOverlay(true)
                        setNewOverlayName('')
                      }}
                      className="ml-auto flex items-center justify-center p-1 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      title={t.sidebar.overlays}
                    >
                      <Plus className="size-4" />
                    </button>
                    <ChevronRight className={cn('transition-transform ml-1 size-4', overlaysOpen && 'rotate-90')} />
                  </div>
                </SidebarMenuButton>

                {overlaysOpen && (
                  <SidebarMenuSub>
                    {isCreatingOverlay && (
                      <SidebarMenuSubItem>
                        <div 
                          className="flex items-center px-2 py-1 gap-2 cursor-text"
                          onClick={(e) => e.currentTarget.querySelector('input')?.focus()}
                        >
                          <input
                            autoFocus
                            placeholder="Overlay name..."
                            className="w-full bg-background border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                            value={newOverlayName}
                            onChange={e => setNewOverlayName(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter' && newOverlayName.trim()) {
                                const name = newOverlayName.trim()
                                const id = `scene-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
                                const urlKey = uniqueUrlKey(name, overlays.map((o) => o.urlKey))
                                setIsCreatingOverlay(false)
                                setNewOverlayName("")
                                await saveOverlay({ id, name, urlKey, nodes: [], edges: [] })
                                onNavigate(`overlays/custom/${id}` as NavKey)
                              } else if (e.key === 'Escape') {
                                setIsCreatingOverlay(false)
                                setNewOverlayName("")
                              }
                            }}
                            onBlur={(e) => {
                              // If focus moved to another focusable element in the app (e.relatedTarget is not null),
                              // it means the user clicked a button/link. We can safely cancel.
                              // If e.relatedTarget is null, it might be a window blur (Alt+Shift layout change, 
                              // clicking outside window) or clicking a non-focusable background div. We keep it open.
                              if (e.relatedTarget && e.relatedTarget !== document.body) {
                                setIsCreatingOverlay(false)
                                setNewOverlayName("")
                              }
                            }}
                          />
                        </div>
                      </SidebarMenuSubItem>
                    )}
                    {overlays.map((overlay) => (
                      <SidebarMenuSubItem key={overlay.id} className="group/scene-item relative">
                        <SidebarMenuSubButton
                          isActive={active === `overlays/custom/${overlay.id}`}
                          className="pr-7"
                          onClick={(event) => {
                            event.preventDefault()
                            onNavigate(`overlays/custom/${overlay.id}` as NavKey)
                          }}
                        >
                          <Workflow />
                          <span>{overlay.name}</span>
                        </SidebarMenuSubButton>
                        <button
                          onClick={async (e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (!window.confirm(`Delete scene "${overlay.name}"?`)) return
                            await deleteOverlay(overlay.id)
                            if (active === `overlays/custom/${overlay.id}`) onNavigate('dashboard')
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center p-1 rounded opacity-0 group-hover/scene-item:opacity-100 hover:bg-sidebar-accent hover:text-destructive"
                          title="Delete scene"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </SidebarMenuSubItem>
                    ))}
                    {overlays.length === 0 && !isCreatingOverlay && (
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton className="opacity-50 pointer-events-none">
                          <span>No overlays yet</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    )}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isToolsActive && !toolsOpen}
                  tooltip={t.sidebar.tools}
                  onClick={() => setToolsOpen((open) => !open)}
                >
                  <Wrench />
                  <span>{t.sidebar.tools}</span>
                  <ChevronRight className={cn('ml-auto transition-transform', toolsOpen && 'rotate-90')} />
                </SidebarMenuButton>

                {toolsOpen && (
                  <SidebarMenuSub>
                    {EVENT_KEYS.map((key) => {
                      const { navKey, icon: Icon } = EVENTS_META[key]
                      return (
                        <SidebarMenuSubItem key={key}>
                          <SidebarMenuSubButton
                            isActive={active === navKey}
                            onClick={(event) => {
                              event.preventDefault()
                              onNavigate(navKey)
                            }}
                          >
                            <Icon />
                            <span>{eventLabelsByKey[key]}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isIntegrationsActive && !integrationsOpen}
                  tooltip={t.sidebar.integrations}
                  onClick={() => setIntegrationsOpen((open) => !open)}
                >
                  <Plug />
                  <span>{t.sidebar.integrations}</span>
                  <ChevronRight
                    className={cn('ml-auto transition-transform', integrationsOpen && 'rotate-90')}
                  />
                </SidebarMenuButton>

                {integrationsOpen && (
                  <SidebarMenuSub>
                    {INTEGRATION_KEYS.map((key) => {
                      const { navKey, label, icon: Icon } = INTEGRATIONS_META[key]
                      return (
                        <SidebarMenuSubItem key={key}>
                          <SidebarMenuSubButton
                            isActive={active === navKey}
                            onClick={(event) => {
                              event.preventDefault()
                              onNavigate(navKey)
                            }}
                          >
                            <Icon />
                            <span>{label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={active === 'settings'}
                  tooltip={t.sidebar.settings}
                  onClick={() => onNavigate('settings')}
                >
                  <Settings />
                  <span>{t.sidebar.settings}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {(updaterStatus.state === 'available' ||
          updaterStatus.state === 'downloading' ||
          updaterStatus.state === 'downloaded') && (
          <button
            onClick={downloadUpdate}
            disabled={updaterStatus.state !== 'available'}
            className="mx-2 mb-1 flex items-center justify-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-wait disabled:opacity-80 group-data-[collapsible=icon]:hidden"
          >
            <Download className="size-3.5" />
            <span>
              {updaterStatus.state === 'downloading'
                ? interpolate(t.updater.downloading, { percent: String(updaterStatus.percent) })
                : updaterStatus.state === 'downloaded'
                  ? t.updater.installing
                  : t.updater.update}
            </span>
          </button>
        )}
        <p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {appVersion && (
            <>
              <button
                onClick={() => window.maddoner.openExternal(RELEASES_URL)}
                className="hover:text-foreground hover:underline"
                title={t.sidebar.releaseNotes}
              >
                v{appVersion}
              </button>{' '}
            </>
          )}
          by MISQZY
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
