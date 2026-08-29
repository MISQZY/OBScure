import type { Dictionary } from '@/lib/i18n/types'
import type { NavKey } from '@/lib/nav'

/** Keeping this derived from the dictionary means adding a step here without matching onboarding.steps content is a type error, not a silent blank tooltip. */
export type TourStepId = keyof Dictionary['onboarding']['steps']

export interface TourStepConfig {
  id: TourStepId
  /** Page to switch to before this step is shown; omit to stay on whatever page is already active. */
  page?: NavKey
  /** CSS selector (a data-tour attribute) for the element this step points at; omit for a centered, un-anchored step. */
  target?: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * The onboarding walkthrough shown on first launch (see TourProvider) and
 * replayable from Settings. Every target is either not inside any
 * CollapsibleSection, or is a top-level (h2) CollapsibleSection's own root —
 * its header stays rendered (and correctly positioned) even while collapsed,
 * so a step never points at something that can vanish from the DOM.
 */
export const TOUR_STEPS: TourStepConfig[] = [
  { id: 'welcome', page: 'dashboard', target: '[data-tour="app-logo"]', placement: 'right' },
  { id: 'sidebarNav', page: 'dashboard', target: '[data-tour="sidebar-nav"]', placement: 'right' },
  { id: 'dashboardIntegrations', page: 'dashboard', target: '[data-tour="dashboard-integrations"]', placement: 'top' },
  { id: 'integrationsConnect', page: 'integrations/spotify', target: '[data-tour="connect-button"]', placement: 'right' },
  { id: 'settingsOverlayAddress', page: 'settings', target: '[data-tour="settings-overlay-address"]', placement: 'bottom' },
  { id: 'settingsCanvas', page: 'settings', target: '[data-tour="settings-canvas"]', placement: 'top' },
  { id: 'restartTour', page: 'settings', target: '[data-tour="restart-tour"]', placement: 'top' }
]

/**
 * Every id used here is only ever a target within SceneBuilderPage itself —
 * unlike TOUR_STEPS above, no step sets `page`, since this only ever starts
 * from the "Tutorial" button in Scene Builder's own toolbar (see
 * data-tour="scene-builder-tutorial"), so the right scene is already open.
 * Not shown on first launch — purely a manual walkthrough, see
 * TourProvider.start().
 */
export const SCENE_BUILDER_TOUR_STEPS: TourStepConfig[] = [
  { id: 'sceneBuilderWelcome' },
  { id: 'sceneBuilderAddNode', target: '[data-tour="scene-builder-add-node"]', placement: 'right' },
  { id: 'sceneBuilderWiring', target: '[data-tour="scene-builder-canvas"]', placement: 'left' },
  { id: 'sceneBuilderModifiers' },
  { id: 'sceneBuilderPreview', target: '[data-tour="scene-builder-preview"]', placement: 'left' },
  { id: 'sceneBuilderSaveTest', target: '[data-tour="scene-builder-save"]', placement: 'bottom' },
  { id: 'sceneBuilderUrl', target: '[data-tour="scene-builder-url"]', placement: 'bottom' },
  { id: 'sceneBuilderPatterns' }
]

export type TourId = 'onboarding' | 'sceneBuilder'

export const TOUR_STEP_LISTS: Record<TourId, TourStepConfig[]> = {
  onboarding: TOUR_STEPS,
  sceneBuilder: SCENE_BUILDER_TOUR_STEPS
}
