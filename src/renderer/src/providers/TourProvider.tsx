import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { TOUR_STEP_LISTS, type TourId, type TourStepConfig } from '@/lib/tour'

const STORAGE_KEY = 'maddoner:onboarding-completed'

function readCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Onboarding will just show again next launch in this environment (e.g. private storage disabled).
  }
}

interface TourContextValue {
  isActive: boolean
  stepIndex: number
  step: TourStepConfig | null
  totalSteps: number
  /** Defaults to the first-launch onboarding walkthrough — pass 'sceneBuilder' to start that one instead (see SceneBuilderPage's own "Tutorial" button). */
  start: (tourId?: TourId) => void
  stop: () => void
  next: () => void
  prev: () => void
}

const TourContext = createContext<TourContextValue | null>(null)

export function TourProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [activeTour, setActiveTour] = useState<TourId>('onboarding')
  const steps = TOUR_STEP_LISTS[activeTour]

  // First launch only — a later run always comes from an explicit "start" call (Settings' restart button, Scene Builder's Tutorial button).
  useEffect(() => {
    if (!readCompleted()) {
      setActiveTour('onboarding')
      setStepIndex(0)
      setIsActive(true)
    }
  }, [])

  const start = useCallback((tourId: TourId = 'onboarding') => {
    setActiveTour(tourId)
    setStepIndex(0)
    setIsActive(true)
  }, [])

  // Only the onboarding walkthrough's completion suppresses the first-launch
  // auto-start above — finishing/closing the Scene Builder tour (a purely
  // manual, replay-anytime walkthrough) has nothing to do with that.
  const stop = useCallback(() => {
    setIsActive(false)
    if (activeTour === 'onboarding') writeCompleted()
  }, [activeTour])

  const next = useCallback(() => {
    setStepIndex((current) => {
      if (current + 1 >= steps.length) {
        setIsActive(false)
        if (activeTour === 'onboarding') writeCompleted()
        return current
      }
      return current + 1
    })
  }, [steps, activeTour])

  const prev = useCallback(() => {
    setStepIndex((current) => Math.max(0, current - 1))
  }, [])

  const value = useMemo<TourContextValue>(
    () => ({
      isActive,
      stepIndex,
      step: isActive ? steps[stepIndex] : null,
      totalSteps: steps.length,
      start,
      stop,
      next,
      prev
    }),
    [isActive, stepIndex, steps, start, stop, next, prev]
  )

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext)
  if (!ctx) throw new Error('useTour must be used within a TourProvider')
  return ctx
}
