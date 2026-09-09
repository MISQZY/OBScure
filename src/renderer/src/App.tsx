import { Fragment, lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import { CustomOverlaysProvider } from '@/providers/CustomOverlaysProvider'
import { GlobalVariablesProvider } from '@/providers/GlobalVariablesProvider'
import { CommandsProvider } from '@/providers/CommandsProvider'
import { TwitchStatsProvider } from '@/providers/TwitchStatsProvider'
import { StreamerBotVariablesProvider } from '@/providers/StreamerBotVariablesProvider'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { TitleBar } from '@/components/layout/TitleBar'
import { TourOverlay } from '@/components/TourOverlay'
import { WhatsNewDialog } from '@/components/WhatsNewDialog'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Separator,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  ScrollArea,
  TooltipProvider
} from '@/components/ui'
import { DashboardPage } from '@/pages/DashboardPage'

// Lazy-loaded: each becomes its own chunk, fetched/parsed only the first
// time the user actually navigates there, instead of every page (plus the
// @xyflow/react scene editor + dagre pulled in by SceneBuilderPage) being
// parsed and resident in the main window's heap from app start.
const SpotifyPage = lazy(() => import('@/pages/integrations/SpotifyPage').then((m) => ({ default: m.SpotifyPage })))
const WindowsMediaPage = lazy(() =>
  import('@/pages/integrations/WindowsMediaPage').then((m) => ({ default: m.WindowsMediaPage }))
)
const TwitchPage = lazy(() => import('@/pages/integrations/TwitchPage').then((m) => ({ default: m.TwitchPage })))
const YoutubePage = lazy(() => import('@/pages/integrations/YoutubePage').then((m) => ({ default: m.YoutubePage })))
const StreamerBotPage = lazy(() =>
  import('@/pages/integrations/StreamerBotPage').then((m) => ({ default: m.StreamerBotPage }))
)
const ObsPage = lazy(() => import('@/pages/integrations/ObsPage').then((m) => ({ default: m.ObsPage })))
const SceneBuilderPage = lazy(() =>
  import('@/pages/overlays/SceneBuilderPage').then((m) => ({ default: m.SceneBuilderPage }))
)
const RandomToolPage = lazy(() => import('@/pages/tools/RandomToolPage').then((m) => ({ default: m.RandomToolPage })))
const RouletteToolPage = lazy(() =>
  import('@/pages/tools/RouletteToolPage').then((m) => ({ default: m.RouletteToolPage }))
)
const CommandsPage = lazy(() => import('@/pages/actions/CommandsPage').then((m) => ({ default: m.CommandsPage })))
const ActionsPage = lazy(() => import('@/pages/actions/ActionsPage').then((m) => ({ default: m.ActionsPage })))
const QueuesPage = lazy(() => import('@/pages/actions/QueuesPage').then((m) => ({ default: m.QueuesPage })))
const VariablesPage = lazy(() => import('@/pages/data/VariablesPage').then((m) => ({ default: m.VariablesPage })))
const EventLogPage = lazy(() => import('@/pages/data/EventLogPage').then((m) => ({ default: m.EventLogPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
import { getDefaultBreadcrumbs, getNavBreadcrumbs, type NavKey } from '@/lib/nav'
import { I18nProvider, useI18n } from '@/providers/I18nProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { CustomConfigProvider } from '@/providers/CustomConfigProvider'
import { TourProvider, useTour } from '@/providers/TourProvider'

const PAGES: Partial<Record<NavKey, ComponentType>> = {
  'tools/random': RandomToolPage,
  'tools/roulette': RouletteToolPage,
  'actions/commands': CommandsPage,
  actions: ActionsPage,
  'actions/queues': QueuesPage,
  'data/variables': VariablesPage,
  'data/event-log': EventLogPage,
  'integrations/spotify': SpotifyPage,
  'integrations/windows-media': WindowsMediaPage,
  'integrations/twitch': TwitchPage,
  'integrations/youtube': YoutubePage,
  'integrations/streamerbot': StreamerBotPage,
  'integrations/obs': ObsPage,
  settings: SettingsPage
}

function AppShell() {
  const { t } = useI18n()
  const { step: tourStep } = useTour()
  const [active, setActive] = useState<NavKey>('dashboard')
  const Page = PAGES[active]
  const crumbs = getNavBreadcrumbs(t)[active] || getDefaultBreadcrumbs(t)

  // Walks the user through the app page by page as the onboarding tour advances.
  useEffect(() => {
    if (tourStep?.page && tourStep.page !== active) setActive(tourStep.page)
  }, [tourStep, active])

  return (
    <TooltipProvider>
      {/* min-h-svh (SidebarProvider's default) would let this overflow past the
          window's remaining height below the titlebar — h-full/min-h-0 instead
          confines it to whatever the flex-1 wrapper in App() gives it. The
          Sidebar panel itself (see sidebar.tsx) fixes to the real viewport,
          offset below the titlebar by a constant — not contained via a
          transformed ancestor here, since that forced it onto its own
          compositor layer that visibly lagged during live window resize. */}
      <SidebarProvider className="h-full min-h-0">
        <AppSidebar active={active} onNavigate={setActive} />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {crumbs.map((crumb, index) => (
                  <Fragment key={`${crumb.label}-${index}`}>
                    <BreadcrumbItem>
                      {index === crumbs.length - 1 ? (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      ) : crumb.navKey ? (
                        <BreadcrumbLink asChild>
                          <button type="button" className="cursor-pointer" onClick={() => setActive(crumb.navKey!)}>
                            {crumb.label}
                          </button>
                        </BreadcrumbLink>
                      ) : (
                        crumb.label
                      )}
                    </BreadcrumbItem>
                    {index < crumbs.length - 1 && <BreadcrumbSeparator />}
                  </Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          {active.startsWith('overlays/custom/') ? (
            <main className="relative flex-1 overflow-hidden">
              <Suspense fallback={null}>
                <SceneBuilderPage customOverlayId={active.split('/').pop()!} onNavigate={setActive} />
              </Suspense>
            </main>
          ) : (
            <ScrollArea className="relative flex-1">
              <main className="p-6 h-full">
                {active === 'dashboard' ? (
                  <DashboardPage />
                ) : (
                  <Suspense fallback={null}>{Page && <Page />}</Suspense>
                )}
              </main>
            </ScrollArea>
          )}
        </SidebarInset>
      </SidebarProvider>
      <TourOverlay />
      <WhatsNewDialog />
    </TooltipProvider>
  )
}

function App() {
  return (
    <CustomConfigProvider>
      <ThemeProvider>
        <I18nProvider>
          <TourProvider>
            <CustomOverlaysProvider>
              <GlobalVariablesProvider>
                <CommandsProvider>
                  <TwitchStatsProvider>
                    <StreamerBotVariablesProvider>
                      <div className="flex h-screen flex-col overflow-hidden">
                        <TitleBar />
                        <div className="min-h-0 flex-1">
                          <AppShell />
                        </div>
                      </div>
                    </StreamerBotVariablesProvider>
                  </TwitchStatsProvider>
                </CommandsProvider>
              </GlobalVariablesProvider>
            </CustomOverlaysProvider>
          </TourProvider>
        </I18nProvider>
      </ThemeProvider>
    </CustomConfigProvider>
  )
}

export default App
