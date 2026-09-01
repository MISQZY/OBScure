import React, { useEffect, useState } from 'react'
import { ChevronRight, Download, Folder, FolderPlus, LayoutDashboard, Layers, Plug, Settings, Trash2, Workflow, Wrench, Plus } from 'lucide-react'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
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
import type { CustomOverlay, OverlayFolder } from '@shared/types'

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
  const { overlays, saveOverlay, folders, saveFolder, deleteFolder, moveOverlayToFolder } = useCustomOverlays()

  const isToolsActive = active.startsWith('tools/')
  const isIntegrationsActive = active.startsWith('integrations/')

  // undefined = not creating an overlay; null = creating at the top level (no folder); a folder id = creating inside that folder.
  const [creatingOverlayFolderId, setCreatingOverlayFolderId] = useState<string | null | undefined>(undefined)
  const [newOverlayName, setNewOverlayName] = useState("")
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renameFolderName, setRenameFolderName] = useState("")
  const [draggedOverlayId, setDraggedOverlayId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState("")
  const [updaterStatus, downloadUpdate] = useAppUpdater()

  useEffect(() => {
    window.maddoner.getAppVersion().then(setAppVersion)
  }, [])

  const ungroupedOverlays = overlays.filter((o) => !o.folderId)

  const createOverlay = async (name: string, folderId?: string): Promise<void> => {
    const id = `scene-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const urlKey = uniqueUrlKey(name, overlays.map((o) => o.urlKey))
    await saveOverlay({ id, name, urlKey, nodes: [], edges: [], folderId })
    onNavigate(`overlays/custom/${id}` as NavKey)
  }

  const createFolder = async (name: string): Promise<void> => {
    const id = `folder-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    await saveFolder({ id, name })
  }

  const toggleFolder = (folderId: string): void => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const renderCreateOverlayInput = (folderId?: string): React.ReactElement => (
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
          onChange={(e) => setNewOverlayName(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && newOverlayName.trim()) {
              const name = newOverlayName.trim()
              setCreatingOverlayFolderId(undefined)
              setNewOverlayName("")
              await createOverlay(name, folderId)
            } else if (e.key === 'Escape') {
              setCreatingOverlayFolderId(undefined)
              setNewOverlayName("")
            }
          }}
          onBlur={(e) => {
            // If focus moved to another focusable element in the app (e.relatedTarget is not null),
            // it means the user clicked a button/link. We can safely cancel.
            // If e.relatedTarget is null, it might be a window blur (Alt+Shift layout change,
            // clicking outside window) or clicking a non-focusable background div. We keep it open.
            if (e.relatedTarget && e.relatedTarget !== document.body) {
              setCreatingOverlayFolderId(undefined)
              setNewOverlayName("")
            }
          }}
        />
      </div>
    </SidebarMenuSubItem>
  )

  const renderOverlayItem = (overlay: CustomOverlay): React.ReactElement => (
    <SidebarMenuSubItem key={overlay.id}>
      <SidebarMenuSubButton
        isActive={active === `overlays/custom/${overlay.id}`}
        draggable
        onDragStart={(e) => {
          setDraggedOverlayId(overlay.id)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', overlay.id)
        }}
        onDragEnd={() => {
          setDraggedOverlayId(null)
          setDragOverFolderId(null)
        }}
        onClick={(event) => {
          event.preventDefault()
          onNavigate(`overlays/custom/${overlay.id}` as NavKey)
        }}
        className={cn(draggedOverlayId === overlay.id && 'opacity-50')}
      >
        <Workflow />
        <span>{overlay.name}</span>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  )

  const renderFolder = (folder: OverlayFolder): React.ReactElement => {
    const folderOverlays = overlays.filter((o) => o.folderId === folder.id)
    const isOpen = !collapsedFolders.has(folder.id)
    const isDragOver = dragOverFolderId === folder.id
    const handleFolderDragOver = (e: React.DragEvent): void => {
      if (!draggedOverlayId) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setDragOverFolderId(folder.id)
    }
    const handleFolderDrop = (e: React.DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const overlayId = e.dataTransfer.getData('text/plain') || draggedOverlayId
      if (overlayId) void moveOverlayToFolder(overlayId, folder.id)
      setDraggedOverlayId(null)
      setDragOverFolderId(null)
    }

    return (
      <SidebarMenuSubItem key={folder.id}>
        <div
          className={cn(
            'group/folder flex h-7 min-w-0 w-full -translate-x-px cursor-pointer items-center gap-2 overflow-hidden rounded-md px-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            isDragOver && 'bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-ring'
          )}
          onClick={() => toggleFolder(folder.id)}
          onDragOver={handleFolderDragOver}
          onDragLeave={() => setDragOverFolderId((prev) => (prev === folder.id ? null : prev))}
          onDrop={handleFolderDrop}
        >
          <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', isOpen && 'rotate-90')} />
          <Folder className="size-4 shrink-0" />
          {renamingFolderId === folder.id ? (
            <input
              autoFocus
              className="w-full min-w-0 bg-background border rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary"
              value={renameFolderName}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenameFolderName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && renameFolderName.trim()) {
                  void saveFolder({ ...folder, name: renameFolderName.trim() })
                  setRenamingFolderId(null)
                } else if (e.key === 'Escape') {
                  setRenamingFolderId(null)
                }
              }}
              onBlur={() => setRenamingFolderId(null)}
            />
          ) : (
            <span
              className="truncate flex-1"
              title={folder.name}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setRenamingFolderId(folder.id)
                setRenameFolderName(folder.name)
              }}
            >
              {folder.name}
            </span>
          )}
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setCollapsedFolders((prev) => {
                if (!prev.has(folder.id)) return prev
                const next = new Set(prev)
                next.delete(folder.id)
                return next
              })
              setCreatingOverlayFolderId(folder.id)
              setNewOverlayName('')
            }}
            className="ml-auto flex items-center justify-center p-1 rounded opacity-0 group-hover/folder:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground shrink-0"
            title="New overlay in folder"
          >
            <Plus className="size-3.5" />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                className="flex items-center justify-center p-1 rounded opacity-0 group-hover/folder:opacity-100 hover:bg-destructive/10 hover:text-destructive shrink-0"
                title="Delete folder"
              >
                <Trash2 className="size-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
              <AlertDialogTitle>
                {`Delete folder "${folder.name}"? Overlays inside will not be deleted.`}
              </AlertDialogTitle>
              <AlertDialogFooter>
                <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => deleteFolder(folder.id)}>
                  {t.common.delete}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {isOpen && (
          <SidebarMenuSub onDragOver={handleFolderDragOver} onDrop={handleFolderDrop}>
            {creatingOverlayFolderId === folder.id && renderCreateOverlayInput(folder.id)}
            {folderOverlays.map(renderOverlayItem)}
            {folderOverlays.length === 0 && creatingOverlayFolderId !== folder.id && (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton className="opacity-50 pointer-events-none">
                  <span>Empty</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}
          </SidebarMenuSub>
        )}
      </SidebarMenuSubItem>
    )
  }

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
                        setIsCreatingFolder(true)
                        setNewFolderName('')
                      }}
                      className="ml-auto flex items-center justify-center p-1 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      title="New folder"
                    >
                      <FolderPlus className="size-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setOverlaysOpen(true)
                        setCreatingOverlayFolderId(null)
                        setNewOverlayName('')
                      }}
                      className="flex items-center justify-center p-1 rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      title={t.sidebar.overlays}
                    >
                      <Plus className="size-4" />
                    </button>
                    <ChevronRight className={cn('transition-transform ml-1 size-4', overlaysOpen && 'rotate-90')} />
                  </div>
                </SidebarMenuButton>

                {overlaysOpen && (
                  <SidebarMenuSub
                    onDragOver={(e) => {
                      if (!draggedOverlayId) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const overlayId = e.dataTransfer.getData('text/plain') || draggedOverlayId
                      if (overlayId) void moveOverlayToFolder(overlayId, undefined)
                      setDraggedOverlayId(null)
                      setDragOverFolderId(null)
                    }}
                  >
                    {isCreatingFolder && (
                      <SidebarMenuSubItem>
                        <div
                          className="flex items-center px-2 py-1 gap-2 cursor-text"
                          onClick={(e) => e.currentTarget.querySelector('input')?.focus()}
                        >
                          <input
                            autoFocus
                            placeholder="Folder name..."
                            className="w-full bg-background border rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter' && newFolderName.trim()) {
                                const name = newFolderName.trim()
                                setIsCreatingFolder(false)
                                setNewFolderName('')
                                await createFolder(name)
                              } else if (e.key === 'Escape') {
                                setIsCreatingFolder(false)
                                setNewFolderName('')
                              }
                            }}
                            onBlur={(e) => {
                              if (e.relatedTarget && e.relatedTarget !== document.body) {
                                setIsCreatingFolder(false)
                                setNewFolderName('')
                              }
                            }}
                          />
                        </div>
                      </SidebarMenuSubItem>
                    )}
                    {folders.map(renderFolder)}
                    {creatingOverlayFolderId === null && renderCreateOverlayInput(undefined)}
                    {ungroupedOverlays.map(renderOverlayItem)}
                    {overlays.length === 0 && folders.length === 0 && !isCreatingFolder && creatingOverlayFolderId === undefined && (
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
