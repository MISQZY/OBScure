import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTour } from '@/providers/TourProvider'
import { useI18n } from '@/providers/I18nProvider'
import { interpolate } from '@/lib/i18n/interpolate'
import type { TourStepConfig } from '@/lib/tour'

const GAP = 12
const VIEWPORT_PADDING = 16
const TOOLTIP_WIDTH = 320
const FIND_RETRY_MS = 50
const FIND_MAX_ATTEMPTS = 60
const RECT_POLL_MS = 300
const SPOTLIGHT_PAD = 6

interface Position {
  top: number
  left: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function computePosition(rect: DOMRect | null, placement: TourStepConfig['placement'], tooltipW: number, tooltipH: number): Position {
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  if (!rect) {
    return {
      top: clamp(viewportH / 2 - tooltipH / 2, VIEWPORT_PADDING, viewportH - tooltipH - VIEWPORT_PADDING),
      left: clamp(viewportW / 2 - tooltipW / 2, VIEWPORT_PADDING, viewportW - tooltipW - VIEWPORT_PADDING)
    }
  }

  let top: number
  let left: number
  switch (placement) {
    case 'top':
      top = rect.top - GAP - tooltipH
      left = rect.left + rect.width / 2 - tooltipW / 2
      break
    case 'left':
      top = rect.top + rect.height / 2 - tooltipH / 2
      left = rect.left - GAP - tooltipW
      break
    case 'right':
      top = rect.top + rect.height / 2 - tooltipH / 2
      left = rect.right + GAP
      break
    case 'bottom':
    default:
      top = rect.bottom + GAP
      left = rect.left + rect.width / 2 - tooltipW / 2
      break
  }

  return {
    top: clamp(top, VIEWPORT_PADDING, viewportH - tooltipH - VIEWPORT_PADDING),
    left: clamp(left, VIEWPORT_PADDING, viewportW - tooltipW - VIEWPORT_PADDING)
  }
}

/**
 * Renders the onboarding walkthrough: a dark, click-blocking backdrop with a
 * "spotlight" cutout around the current step's target (a single element with
 * a huge box-shadow — simpler and more robust than an SVG mask), plus a
 * tooltip card with title/description/step counter/prev/next. Portaled to
 * document.body so it always sits above the app regardless of any ancestor's
 * stacking context.
 */
export function TourOverlay() {
  const { isActive, step, stepIndex, totalSteps, next, prev, stop } = useTour()
  const { t } = useI18n()
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [position, setPosition] = useState<Position | null>(null)

  // Reset synchronously (layout effect, not a plain effect) so a step with
  // no target — a centered step, like a tour's opening/closing slide — never
  // paints a frame using the PREVIOUS step's rect first. Plain effects are
  // deferred until after paint, so relying on one here would let this
  // component's other layout effect (below) compute the tooltip's position
  // from stale, unrelated coordinates on the very frame this step first
  // shows, before that reset ever got a chance to run.
  useLayoutEffect(() => {
    setRect(null)
    setPosition(null)
  }, [step])

  // Locate (and keep tracking) the current step's target element.
  useEffect(() => {
    if (!step?.target) return undefined

    let cancelled = false
    let attempts = 0

    const poll = (): void => {
      if (cancelled) return
      const el = document.querySelector<HTMLElement>(step.target as string)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        setRect(el.getBoundingClientRect())
        return
      }
      attempts += 1
      if (attempts < FIND_MAX_ATTEMPTS) setTimeout(poll, FIND_RETRY_MS)
    }
    poll()

    const interval = setInterval(() => {
      const el = document.querySelector<HTMLElement>(step.target as string)
      if (el) setRect(el.getBoundingClientRect())
    }, RECT_POLL_MS)
    window.addEventListener('resize', poll)

    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('resize', poll)
    }
  }, [step])

  // Position the tooltip once its own (content-dependent) size is known.
  useLayoutEffect(() => {
    if (!step || !tooltipRef.current) return
    const size = tooltipRef.current.getBoundingClientRect()
    setPosition(computePosition(rect, step.placement, size.width || TOOLTIP_WIDTH, size.height))
  }, [rect, step])

  if (!isActive || !step) return null

  const content = t.onboarding.steps[step.id]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === totalSteps - 1

  return createPortal(
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true">
      {/* Click-blocking backdrop — transparent where the spotlight box-shadow already darkens everything else. */}
      <div className="absolute inset-0" onClick={(event) => event.stopPropagation()} />

      {rect && (
        <div
          className="pointer-events-none fixed rounded-lg shadow-[0_0_0_3px_rgba(255,255,255,0.9),0_0_0_9999px_rgba(0,0,0,0.65)] transition-[top,left,width,height] duration-200 ease-out"
          style={{
            top: rect.top - SPOTLIGHT_PAD,
            left: rect.left - SPOTLIGHT_PAD,
            width: rect.width + SPOTLIGHT_PAD * 2,
            height: rect.height + SPOTLIGHT_PAD * 2
          }}
        />
      )}
      {!rect && <div className="fixed inset-0 bg-black/65" />}

      <div
        ref={tooltipRef}
        className="fixed flex flex-col gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg transition-opacity duration-150"
        style={{
          width: TOOLTIP_WIDTH,
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          opacity: position ? 1 : 0
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {interpolate(t.onboarding.stepCounter, { current: String(stepIndex + 1), total: String(totalSteps) })}
          </span>
          <button
            type="button"
            onClick={stop}
            aria-label={t.onboarding.close}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{content.title}</h3>
          <p className="text-sm text-muted-foreground">{content.description}</p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {isFirst ? (
            <span />
          ) : (
            <Button variant="outline" size="sm" onClick={prev}>
              <ChevronLeft className="size-3.5" />
              {t.onboarding.back}
            </Button>
          )}
          <Button size="sm" onClick={next}>
            {isLast ? t.onboarding.finish : t.onboarding.next}
            {!isLast && <ChevronRight className="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
