import { Fragment, useEffect, useState, type ComponentType } from 'react'
import { CustomOverlaysProvider } from '@/providers/CustomOverlaysProvider'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { TitleBar } from '@/components/layout/TitleBar'
import { TourOverlay } from '@/components/TourOverlay'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DashboardPage } from '@/pages/DashboardPage'
import { SpotifyPage } from '@/pages/integrations/SpotifyPage'
import { WindowsMediaPage } from '@/pages/integrations/WindowsMediaPage'
import { TwitchPage } from '@/pages/integrations/TwitchPage'
import { YoutubePage } from '@/pages/integrations/YoutubePage'
import { SceneBuilderPage } from '@/pages/overlays/SceneBuilderPage'
import { RandomToolPage } from '@/pages/tools/RandomToolPage'
import { RouletteToolPage } from '@/pages/tools/RouletteToolPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { getNavBreadcrumbs, type NavKey } from '@/lib/nav'
import { I18nProvider, useI18n } from '@/providers/I18nProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { CustomConfigProvider } from '@/providers/CustomConfigProvider'
import { TourProvider, useTour } from '@/providers/TourProvider'

const PAGES: Partial<Record<NavKey, ComponentType>> = {
  'tools/random': RandomToolPage,
  'tools/roulette': RouletteToolPage,
  'integrations/spotify': SpotifyPage,
  'integrations/windows-media': WindowsMediaPage,
  'integrations/twitch': TwitchPage,
  'integrations/youtube': YoutubePage,
  settings: SettingsPage
}

function AppShell() {
  const { t } = useI18n()
  const { step: tourStep } = useTour()
  const [active, setActive] = useState<NavKey>('dashboard')
  const Page = PAGES[active]
  const crumbs = getNavBreadcrumbs(t)[active] || [t.sidebar.overlays]

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
                  <Fragment key={crumb}>
                    <BreadcrumbItem>
                      {index === crumbs.length - 1 ? (
                        <BreadcrumbPage>{crumb}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink>{crumb}</BreadcrumbLink>
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
              <SceneBuilderPage customOverlayId={active.split('/').pop()!} onNavigate={setActive} />
            </main>
          ) : (
            <ScrollArea className="relative flex-1">
              <main className="p-6 h-full">
                {active === 'dashboard' ? (
                  <DashboardPage />
                ) : (
                  Page && <Page />
                )}
              </main>
            </ScrollArea>
          )}
        </SidebarInset>
      </SidebarProvider>
      <TourOverlay />
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
              <div className="flex h-screen flex-col overflow-hidden">
                <TitleBar />
                <div className="min-h-0 flex-1">
                  <AppShell />
                </div>
              </div>
            </CustomOverlaysProvider>
          </TourProvider>
        </I18nProvider>
      </ThemeProvider>
    </CustomConfigProvider>
  )
}

export default App
