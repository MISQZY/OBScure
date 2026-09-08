import { useRef, useEffect } from "react";
import { Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { OverlayUrls } from "@shared/types";

/** The subset of paratrooper.js's/airdrop.js's returned controller this page drives — see overlays/paratrooper.js's setup() doc comment for what each does. */
export interface OverlayEffectController {
  setSpeed: (speed: number) => void
  setRepeat: (repeat: boolean) => void
  setNickname?: (name: string) => void
  setLabel?: (text: string) => void
  trigger: () => void
}


/**
 * paratrooper.js/airdrop.js are the exact scripts overlays/custom.html loads
 * for the real OBS Browser Source — loaded here from that same local overlay
 * server (see OverlayUrls.host/port) so the in-editor preview shows the
 * actual sprite drop instead of a reimplementation. Cached at module scope:
 * every BackgroundFxLayer instance across the app session shares the one
 * fetch/parse and the resulting window.OverlayParatrooperEffect/
 * OverlayAirdropEffect globals.
 */
export let overlayEffectScriptsPromise: Promise<void> | null = null

export function loadOverlayEffectScripts(host: string, port: number): Promise<void> {
  if (overlayEffectScriptsPromise) return overlayEffectScriptsPromise
  const base = `http://${host}:${port}/overlays`
  for (const href of [`${base}/paratrooper.css`, `${base}/airdrop.css`]) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
  }
  const loadScript = (src: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.onload = () => resolve()
      script.onerror = () => reject(new Error(`Failed to load ${src}`))
      document.head.appendChild(script)
    })
  overlayEffectScriptsPromise = Promise.all([loadScript(`${base}/paratrooper.js`), loadScript(`${base}/airdrop.js`)]).then(
    () => {}
  )
  return overlayEffectScriptsPromise
}


/**
 * The ambient full-panel layer a Background FX node produces — mirrors
 * #bg/.overlay-bg in overlays/custom.html. Rendered as a sibling of
 * ScenePreview, absolutely positioned within the same preview panel, so it
 * shows even when nothing is otherwise connected to Scene.
 *
 * gradient/pulse/stars/vignette are driven by data-bg + the preview's own
 * copy of background-animations.css (scene-preview-animations.css).
 * paratrooper/airdrop instead load and drive the REAL
 * overlays/paratrooper.js|airdrop.js (loadOverlayEffectScripts above) on
 * this same element — those scripts already auto-play once on becoming
 * active and stop on their own (see setRepeat/trigger on paratrooper.js),
 * so picking the type is enough to see it; `playToken` (bumped by the
 * Preview panel's Play button, see handlePlay) calls .trigger() to replay a
 * non-repeating drop on demand, same as it remounts Text/Image/Box for
 * their own entrance animations. `played` gates activation — for a plain
 * scene that's `playToken > 0` (nothing moves until Play); for an
 * event-triggered scene (see sceneTrigger) it instead follows the
 * simulated/real alert's own show/hide window, same as `vars`/`label`.
 */
export function BackgroundFxLayer({
  node,
  label,
  urls,
  playToken,
  played
}: {
  node?: Node
  /** Text content of whatever Text node is wired into the Background FX node's input — see findBackgroundFxLabel. */
  label: string
  urls: OverlayUrls | null
  playToken: number
  played: boolean
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const controllers = useRef<{ paratrooper?: OverlayEffectController; airdrop?: OverlayEffectController }>({})

  const type = (node?.data.type as string) || 'none'
  const color = (node?.data.color as string) || '#18181b'
  const speed = (node?.data.speed as number) ?? 1
  const repeat = Boolean(node?.data.repeat)

  useEffect(() => {
    if (!urls) return
    let cancelled = false
    loadOverlayEffectScripts(urls.host, urls.port).then(() => {
      if (cancelled || !elRef.current) return
      const w = window as unknown as {
        OverlayParatrooperEffect?: { setup: (el: Element) => OverlayEffectController }
        OverlayAirdropEffect?: { setup: (el: Element) => OverlayEffectController }
      }
      controllers.current.paratrooper = w.OverlayParatrooperEffect?.setup(elRef.current)
      controllers.current.airdrop = w.OverlayAirdropEffect?.setup(elRef.current)
    })
    return () => {
      cancelled = true
    }
  }, [urls])

  useEffect(() => {
    controllers.current.paratrooper?.setSpeed(speed)
    controllers.current.paratrooper?.setRepeat(repeat)
    controllers.current.paratrooper?.setNickname?.(label)
    controllers.current.airdrop?.setSpeed(speed)
    controllers.current.airdrop?.setRepeat(repeat)
    controllers.current.airdrop?.setLabel?.(label)
  }, [speed, repeat, label])

  useEffect(() => {
    // trigger() no-ops via its own isActive() check when nothing is active
    // yet (playToken still 0, so data-bg below is 'none') — so this is safe
    // to call unconditionally, including on mount. It's what forces a
    // REPLAY on every Play bump after the first; the first is instead
    // covered by data-bg/'.visible' transitioning from inert to `type`
    // below, which the scripts' own "just became active" handling already
    // auto-plays once on its own.
    controllers.current.paratrooper?.trigger()
    controllers.current.airdrop?.trigger()
  }, [playToken])

  return (
    <div
      ref={elRef}
      // Inert (data-bg="none", no .visible) until Play is pressed at least
      // once — matches the same playToken > 0 gate the entrance animations
      // use (TextView/ImageView/BoxView): the preview shouldn't move on its
      // own just because a Background FX type was picked, only once Play
      // starts it.
      className={cn('scene-preview-bg', played && type !== 'none' && 'visible')}
      data-bg={played ? type : 'none'}
      style={
        {
          '--bg-animation-color': color,
          '--bg-animation-speed': String(speed)
        } as React.CSSProperties
      }
    />
  )
}
