import { useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Node, Edge } from "@xyflow/react";
import { Music, Image as ImageIcon, Video as VideoIcon, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OverlayUrls } from "@shared/types";
import { buildNodeMap, incoming, lastOfType, migrateLegacyModifierEdges, migrateLegacyAudioPlayerEdges, SAMPLE_ALERT_VARS, SAMPLE_AUDIO_VARS, audioContentValues, hasAudioCover, sceneTrigger, sceneAudioTrigger, animationFallbackMs, maxExitDurationMs, interpolate, hexToRgba, modifierStyle, borderStyle, animationAttrs, PROCESS_TYPES, nextProcessNode, displayEdges, minimapNodeColor, layoutGraph, buildProcessSchedule, handleScreenCenter, processChainNodes, pointOnBezier, processTokenChain, processTokenPosition, processExitBufferMs, processTrigger, computeTaskState, orderingClass, orderingGap, crossAxisFor, boxShapeStyle, MAX_BOX_DEPTH, findBackgroundFx, findBackgroundFxLabel, SaveStatus, NodeMap, Anim, ScheduledTask, TaskState } from "../sceneUtils";

/**
 * Small circle that slides along the process's own Sequence-flow edges
 * during Play/Test, showing at a glance where the running
 * Start→Task→Wait→...→End chain currently is — purely a visual aid, no
 * effect on rendering or on ScenePreview's own separately-computed Task
 * states. Rendered as a `position: fixed` div portaled straight to
 * `document.body` (same pattern NodePopover in components/nodes/index.tsx
 * uses for its own dropdown, and for the same reason: guaranteed not to be
 * clipped or mispositioned by anything in React Flow's own DOM structure)
 * at real screen coordinates from processTokenPosition/handleScreenCenter —
 * NOT a React Flow node, which would mean writing a position into `nodes`
 * state every animation frame, and NOT flow-space coordinates converted via
 * the current pan/zoom, since measuring the real Handle elements already
 * accounts for whatever transform is currently applied. `durationMs` is the
 * full real preview run length (totalMs + the exit buffer — see
 * processExitBufferMs) clockMs is counted against, for processTokenPosition
 * to rescale onto its own virtual timeline.
 */
export function ProcessToken({
  nodes,
  edges,
  clockMs,
  durationMs,
  active
}: {
  nodes: Node[]
  edges: Edge[]
  clockMs: number
  durationMs: number
  active: boolean
}) {
  if (!active) return null
  const point = processTokenPosition(nodes, edges, clockMs, durationMs)
  if (!point) return null
  return createPortal(
    <div
      className="pointer-events-none fixed left-0 top-0 z-[9999] size-3 rounded-full bg-indigo-400 ring-2 ring-indigo-200 shadow-[0_0_8px_2px_rgba(99,102,241,0.7)]"
      style={{ transform: `translate(${point.x - 6}px, ${point.y - 6}px)` }}
    />,
    document.body
  )
}


export function TextView({
  node,
  style,
  anim,
  played,
  hiding,
  vars,
  audioValues,
  crossAxis
}: {
  node: Node
  style: React.CSSProperties
  anim: Anim
  played: boolean
  /** Playing its exit (reverse of entrance) — see the doc comment on ScenePreview's eventState handling. */
  hiding: boolean
  /** Current event's placeholder values (see sceneTrigger) — null outside an event-triggered show. */
  vars: Record<string, unknown> | null
  /** { artist, title } from Audio Player's Content wire into this node's own Content socket, or null — see audioContentValues. Merged into `vars` below, same as buildText merges the live feed in overlays/custom.html; Content's own template still decides what's shown. */
  audioValues: { artist?: string; title?: string } | null
  /**
   * The CROSS axis of whichever Box/Scene this Text is a direct child of
   * (crossAxisFor, computed by the caller off THAT parent's own Ordering) —
   * the axis flexbox's `items-center` (Scene/BoxView's own fixed cross-axis
   * rule) actually leaves room along. Align/Vertical below only stretch
   * this element (alignSelf) to fill that room when it's the relevant one
   * AND the field was actually changed from its default, so a Text using
   * default settings renders pixel-identical to before this existed.
   */
  crossAxis: 'horizontal' | 'vertical'
}) {
  // Bold defaults true (data.bold !== false) — see the matching comment on
  // TextNode in components/nodes/index.tsx: font-weight:700 used to be
  // hardcoded here unconditionally, so every pre-existing Text node must
  // keep rendering bold unless explicitly turned off now that it's a field.
  const bold = node.data.bold !== false
  const italic = Boolean(node.data.italic)
  const align = (node.data.align as 'left' | 'center' | 'right' | 'justify') || 'left'
  const verticalAlign = (node.data.verticalAlign as string) || 'top'
  // A Position modifier's own anchor (top-left/top-right/center/...) is
  // meant to place this element's OWN box at that corner — but the
  // unconditional width:100% below (kept for the in-flow/in-box case, so
  // Align has room to matter there) means the box already spans the full
  // parent width regardless of which corner is picked, so every anchor
  // ends up looking the same. Once something has actually anchored it
  // (position:absolute) AND no Size gives it a real width of its own (see
  // modifierStyle), let it shrink back to its own content instead so the
  // anchor actually differs.
  const isAnchored = style.position === 'absolute' && style.width == null
  const needsStretch = crossAxis === 'horizontal' ? align !== 'left' : verticalAlign !== 'top'
  return (
    <div
      className={cn(anim && played && 'visible', anim && hiding && 'hiding')}
      data-animation={anim?.type}
      style={
        {
          width: isAnchored ? 'auto' : '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: verticalAlign === 'bottom' ? 'flex-end' : verticalAlign === 'middle' ? 'center' : 'flex-start',
          alignSelf: needsStretch ? 'stretch' : undefined,
          // Content's own field is a multi-line textarea — preserves both
          // the line breaks the user typed and normal word-wrapping,
          // instead of CSS's default collapsing every "\n" to a space.
          whiteSpace: 'pre-wrap',
          fontSize: (node.data.fontSize as number) || 32,
          fontWeight: bold ? 700 : 400,
          fontStyle: italic ? 'italic' : 'normal',
          letterSpacing: `${(node.data.letterSpacing as number) ?? 0}px`,
          lineHeight: node.data.lineHeight != null ? (node.data.lineHeight as number) : undefined,
          ...style,
          color: (node.data.color as string) || '#ffffff',
          textAlign: align,
          fontFamily: node.data.fontFamily ? `"${node.data.fontFamily as string}"` : undefined,
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      {interpolate((node.data.text as string) ?? '', audioValues ? { ...vars, ...audioValues } : vars) || (
        // Editor-only affordance — see the matching one on BoxView's empty
        // state. An empty Text node has zero natural width, so without this
        // it (and any Box wrapping only it) collapses to a near-invisible
        // sliver once scaled down for the preview panel.
        <span className="opacity-40 italic">Empty text</span>
      )}
    </div>
  )
}


export function ImageView({
  node,
  style,
  anim,
  played,
  hiding,
  urls,
  audioCover
}: {
  node: Node
  style: React.CSSProperties
  anim: Anim
  played: boolean
  hiding: boolean
  /** Needed to build an absolute URL for an uploaded custom-images file (node.data.customImageName, takes priority over data.src — see ImageNode's own doc comment) — null before getOverlayUrls() resolves, in which case the node just shows its placeholder icon a beat longer. */
  urls: OverlayUrls | null
  /** Whether this node's `imageContent` socket is wired to Audio Player's Content output — see hasAudioCover. Forces the sample album-art placeholder, same priority buildImage in overlays/custom.html gives the live feed over a set URL/uploaded image. */
  audioCover: boolean
}) {
  const customImageName = node.data.customImageName as string | undefined
  const src = audioCover
    ? undefined
    : customImageName && urls
      ? `http://${urls.host}:${urls.port}/overlays/custom-images/${encodeURIComponent(customImageName)}`
      : (node.data.src as string | undefined)
  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden shrink-0',
        anim && played && 'visible',
        anim && hiding && 'hiding'
      )}
      data-animation={anim?.type}
      style={
        {
          background: 'rgba(255, 255, 255, 0.08)',
          // No own Width/Height field (see ImageNode's own doc comment in
          // components/nodes/index.tsx) — 96x96 here is only the fallback;
          // `...style` (a wired Size node's width/height, from
          // modifierStyle) overrides it since it spreads AFTER these.
          width: 96,
          height: 96,
          ...style,
          borderRadius: `${(node.data.borderRadius as number) ?? 8}px`,
          border: borderStyle(node),
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      {src ? (
        <img src={src} className="w-full h-full object-cover" />
      ) : audioCover ? (
        // Editor-only affordance, same reasoning as TextView's "Empty text"
        // — no live album art to preview in the builder, so a distinct icon
        // (rather than the plain ImageIcon an unwired Image shows) confirms
        // the Content wire is doing something instead of looking identical to
        // an empty node.
        <Music className="text-white/40 size-6" />
      ) : (
        <ImageIcon className="text-white/40 size-6" />
      )}
    </div>
  )
}


/** Mirrors ImageView — see buildVideo in overlays/custom.html. Autoplays muted/looping in the editor preview too, same defaults as the real overlay. */
export function VideoView({ node, style, anim, played, hiding }: { node: Node; style: React.CSSProperties; anim: Anim; played: boolean; hiding: boolean }) {
  const src = node.data.src as string | undefined
  const muted = node.data.muted !== false
  const loop = node.data.loop !== false
  return (
    <div
      className={cn('flex items-center justify-center overflow-hidden shrink-0', anim && played && 'visible', anim && hiding && 'hiding')}
      data-animation={anim?.type}
      style={
        {
          background: 'rgba(255, 255, 255, 0.08)',
          // No own Width/Height field, same reasoning as ImageView above.
          width: 320,
          height: 180,
          ...style,
          borderRadius: `${(node.data.borderRadius as number) ?? 8}px`,
          border: borderStyle(node),
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      {src ? (
        <video src={src} autoPlay muted={muted} loop={loop} playsInline className="w-full h-full object-cover" />
      ) : (
        <VideoIcon className="text-white/40 size-6" />
      )}
    </div>
  )
}


/** A content node (Text/Image/Video), or a nested Box (delegated to BoxView) — plus whatever's wired into ITS input (Position, Transform, Animation, ...). */
export function ContentView({
  node,
  edges,
  map,
  playToken,
  played,
  hiding,
  vars,
  schedule,
  clockMs,
  urls,
  depth = 0,
  crossAxis
}: {
  node: Node
  edges: Edge[]
  map: NodeMap
  playToken: number
  played: boolean
  hiding: boolean
  vars: Record<string, unknown> | null
  /** A running Process's resolved Tasks, if any — see computeTaskState. Components with no Task targeting them fall through to the graph's own modifiers/wiring below, unaffected. */
  schedule: ScheduledTask[]
  clockMs: number
  urls: OverlayUrls | null
  /** Nesting depth so far (0 = directly on Scene) — see BoxView's own doc comment for why this is capped. */
  depth?: number
  /** The CROSS axis of whichever Box/Scene `node` is a direct child of — see TextView's own doc comment. Only consumed for a `text` node; a nested Box computes a FRESH one off its own Ordering for ITS OWN children. */
  crossAxis: 'horizontal' | 'vertical'
}) {
  // A nested Box or Group (see BOX_SOCKETS' own doc comment in
  // components/nodes/index.tsx) — BoxView resolves its OWN schedule/style/
  // vars, same as a top-level one, and handles both node types identically
  // except for Box's own decorative styling; ContentView/BoxView are
  // mutually recursive to whatever depth the graph nests.
  if (node.type === 'box' || node.type === 'group') {
    return (
      <BoxView node={node} edges={edges} map={map} playToken={playToken} played={played} hiding={hiding} vars={vars} schedule={schedule} clockMs={clockMs} urls={urls} depth={depth} />
    )
  }
  const mods = incoming(node.id, edges, map)
  const audioValues = node.type === 'text' ? audioContentValues(node.id, edges, map) : null
  const audioCover = node.type === 'image' && hasAudioCover(node.id, edges, map)
  if (schedule.length > 0 && schedule.some((s) => s.targetId === node.id)) {
    const task = computeTaskState(schedule, node.id, clockMs, mods)
    if (!task.visible) return null
    if (node.type === 'text') return <TextView node={node} style={task.style} anim={task.anim} played={true} hiding={task.hiding} vars={vars} audioValues={audioValues} crossAxis={crossAxis} />
    if (node.type === 'image') return <ImageView node={node} style={task.style} anim={task.anim} played={true} hiding={task.hiding} urls={urls} audioCover={audioCover} />
    if (node.type === 'video') return <VideoView node={node} style={task.style} anim={task.anim} played={true} hiding={task.hiding} />
    return null
  }
  const style = modifierStyle(mods)
  const anim = animationAttrs(mods)
  if (node.type === 'text') return <TextView node={node} style={style} anim={anim} played={played} hiding={hiding} vars={vars} audioValues={audioValues} crossAxis={crossAxis} />
  if (node.type === 'image') return <ImageView node={node} style={style} anim={anim} played={played} hiding={hiding} urls={urls} audioCover={audioCover} />
  if (node.type === 'video') return <VideoView node={node} style={style} anim={anim} played={played} hiding={hiding} />
  return null
}


export function BoxView({
  node,
  edges,
  map,
  playToken,
  played,
  hiding,
  vars,
  schedule,
  clockMs,
  urls,
  depth = 0
}: {
  node: Node
  edges: Edge[]
  map: NodeMap
  playToken: number
  played: boolean
  hiding: boolean
  vars: Record<string, unknown> | null
  schedule: ScheduledTask[]
  clockMs: number
  urls: OverlayUrls | null
  depth?: number
}) {
  const isBox = node.type === 'box'
  const incomingNodes = incoming(node.id, edges, map)
  const children =
    depth >= MAX_BOX_DEPTH ? [] : incomingNodes.filter((n) => n.type === 'text' || n.type === 'image' || n.type === 'video' || n.type === 'box' || n.type === 'group')
  const orderClass = orderingClass(incomingNodes)
  const childCrossAxis = crossAxisFor(incomingNodes)

  const useProcess = schedule.length > 0 && schedule.some((s) => s.targetId === node.id)
  const task = useProcess ? computeTaskState(schedule, node.id, clockMs, incomingNodes) : null
  if (useProcess && !task!.visible) return null

  const modStyle = useProcess ? task!.style : modifierStyle(incomingNodes)
  const anim = useProcess ? task!.anim : animationAttrs(incomingNodes)
  const effectivePlayed = useProcess ? true : played
  const effectiveHiding = useProcess ? task!.hiding : hiding

  return (
    <div
      className={cn('flex items-center', orderClass, anim && effectivePlayed && 'visible', anim && effectiveHiding && 'hiding')}
      data-animation={anim?.type}
      style={
        {
          ...modStyle,
          position: modStyle.position ?? 'relative',
          gap: `${orderingGap(incomingNodes)}px`,
          // Group (see GroupNode's own doc comment) skips all of these —
          // it's an invisible wrapper, not a card.
          ...(isBox
            ? {
                background: (node.data.background as string) || '#18181b',
                padding: `${(node.data.paddingY as number) ?? 12}px ${(node.data.paddingX as number) ?? 16}px`,
                border: borderStyle(node),
                ...boxShapeStyle(node)
              }
            : {}),
          ...(anim?.duration ? { '--anim-duration': `${anim.duration}ms` } : {})
        } as React.CSSProperties
      }
    >
      {children.length === 0 && (
        // Editor-only affordance: without this, an unwired Box/Group
        // collapses to just its own padding (a near-invisible dot once the
        // canvas is scaled down for the preview panel) — see
        // BackgroundFxLayer's own preview-vs-real-overlay distinction for
        // the same pattern. Sized in the same ~canvas-px range as real Text
        // content (see TextView) so it survives the same scale-down instead
        // of vanishing at 10px.
        <span className="text-white/30 italic whitespace-nowrap" style={{ fontSize: 20 }}>
          {isBox ? 'Empty shape' : 'Empty group'} — wire a Text, Image, Video, Shape or Group into it
        </span>
      )}
      {children.map((child) => (
        <ContentView
          key={`${child.id}-${playToken}`}
          node={child}
          edges={edges}
          map={map}
          playToken={playToken}
          played={played}
          hiding={hiding}
          vars={vars}
          schedule={schedule}
          clockMs={clockMs}
          urls={urls}
          depth={depth + 1}
          crossAxis={childCrossAxis}
        />
      ))}
    </div>
  )
}


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


/** Live status of an event-triggered Scene (see sceneTrigger) — drives ScenePreview/BackgroundFxLayer's played/hiding/vars gating. */
export interface PreviewEventState {
  active: boolean
  /** Ignored when !active (a plain scene is always "visible"). True through BOTH the 'showing' and 'hiding' phases — content stays mounted while its exit animation plays. */
  visible: boolean
  /** True only during the 'hiding' phase — adds the .hiding class so animations.css plays each Animation node's exit instead of its entrance. Ignored when !active. */
  hiding: boolean
  vars: Record<string, unknown> | null
  alertTypes: string[]
}


/**
 * Renders exactly what overlays/custom.html renders for this node graph —
 * kept in step with it so both the in-editor preview and the real OBS
 * Browser Source agree on what a graph produces.
 *
 * Walks from the Scene node: whatever's wired into it (directly, or nested
 * inside a Box) is what's rendered — see the direction doc comment on
 * BaseNode in components/nodes/index.tsx. A scene saved before Scene existed
 * has no such node; for those, fall back to the old flat scan (first Box,
 * every Image, every Text) so it keeps rendering as it always did.
 *
 * When Scene is event-triggered (eventState.active), nothing renders at all
 * until eventState.visible — matches overlays/custom.html staying hidden
 * for a real Browser Source until a matching alert arrives; Play/Test
 * simulate that arrival (see handlePlay/handleTest in SceneBuilderPage).
 */
export function ScenePreview({
  nodes,
  edges,
  playToken,
  eventState,
  schedule,
  clockMs,
  urls
}: {
  nodes: Node[]
  edges: Edge[]
  playToken: number
  eventState: PreviewEventState
  /** A running Process's resolved Tasks (see buildProcessSchedule) — empty for a scene with no Start node, in which case rendering is exactly as it always was. */
  schedule: ScheduledTask[]
  clockMs: number
  urls: OverlayUrls | null
}) {
  const map = buildNodeMap(nodes)
  const scene = nodes.find((n) => n.type === 'scene')

  if (!scene) {
    const box = nodes.find((n) => n.type === 'box')
    const images = nodes.filter((n) => n.type === 'image')
    const videos = nodes.filter((n) => n.type === 'video')
    const texts = nodes.filter((n) => n.type === 'text')
    return (
      <div
        className="flex flex-col items-center gap-2"
        style={
          box
            ? {
                background: (box.data.background as string) || '#18181b',
                padding: `${(box.data.paddingY as number) ?? 12}px ${(box.data.paddingX as number) ?? 16}px`,
                borderRadius: `${(box.data.borderRadius as number) ?? 10}px`,
                border: box.data.borderEnabled
                  ? `${(box.data.borderWidth as number) ?? 2}px solid ${(box.data.borderColor as string) || '#ffffff'}`
                  : undefined
              }
            : undefined
        }
      >
        {images.map((n) => (
          <ImageView key={`${n.id}-${playToken}`} node={n} style={{}} anim={null} played={playToken > 0} hiding={false} urls={urls} audioCover={false} />
        ))}
        {videos.map((n) => (
          <VideoView key={`${n.id}-${playToken}`} node={n} style={{}} anim={null} played={playToken > 0} hiding={false} />
        ))}
        {texts.map((n) => (
          <TextView key={`${n.id}-${playToken}`} node={n} style={{}} anim={null} played={playToken > 0} hiding={false} vars={null} audioValues={null} crossAxis="horizontal" />
        ))}
      </div>
    )
  }

  if (eventState.active && !eventState.visible) {
    return (
      <span className="text-white/40 text-xs text-center px-4">
        {/* alertTypes is empty when armed purely by Audio Player (no Event — see processTrigger's audioArmed), which has no "type" to name — describe the trigger instead of joining an empty list into a bare "Waiting for  —". */}
        Waiting for {eventState.alertTypes.length > 0 ? eventState.alertTypes.join(' / ') : 'a track change'} — press Play to simulate it.
      </span>
    )
  }

  const renderable = incoming(scene.id, edges, map).filter((n) => n.type === 'box' || n.type === 'group' || n.type === 'text' || n.type === 'image' || n.type === 'video')
  const orderMods = incoming(scene.id, edges, map)
  if (renderable.length === 0) {
    return <span className="text-white/40 text-xs text-center px-4">Nothing connected to Scene yet — wire a Text, Image, Video, Shape or Group into it.</span>
  }

  const played = eventState.active || playToken > 0
  const hiding = eventState.active && eventState.hiding
  const crossAxis = crossAxisFor(orderMods)

  return (
    <div
      className={cn('relative w-full h-full flex items-center justify-center', orderingClass(orderMods))}
      style={{ gap: `${orderingGap(orderMods)}px` }}
    >
      {renderable.map((n) =>
        n.type === 'box' || n.type === 'group' ? (
          <BoxView
            key={`${n.id}-${playToken}`}
            node={n}
            edges={edges}
            map={map}
            playToken={playToken}
            played={played}
            hiding={hiding}
            vars={eventState.vars}
            schedule={schedule}
            clockMs={clockMs}
            urls={urls}
          />
        ) : (
          <ContentView
            key={`${n.id}-${playToken}`}
            node={n}
            edges={edges}
            map={map}
            playToken={playToken}
            played={played}
            hiding={hiding}
            vars={eventState.vars}
            schedule={schedule}
            clockMs={clockMs}
            urls={urls}
            crossAxis={crossAxis}
          />
        )
      )}
    </div>
  )
}
