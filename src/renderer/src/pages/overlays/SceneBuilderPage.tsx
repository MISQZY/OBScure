import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  MarkerType,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  Panel,
  ReactFlowInstance,
  getBezierPath,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './scene-preview-animations.css'
import './scene-builder-canvas.css'
import dagre from 'dagre'
import { nodeTypes, NODE_SOCKETS, NODE_OUTPUTS, CATEGORY_STYLES, NODE_CATEGORY, NODE_DEFAULTS, SavedNodeDataProvider } from '@/components/nodes'
import { useTheme } from '@/providers/ThemeProvider'
import { useCustomOverlays } from '@/providers/CustomOverlaysProvider'
import { CopyableUrl } from '@/components/CopyableUrl'
import { slugify, uniqueUrlKey } from '@/lib/custom-overlays'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Workflow, Trash2, Check, X, Image as ImageIcon, Video as VideoIcon, Music, ChevronRight, Play, FlaskConical, Sparkles, HelpCircle, PanelLeft, PanelRight } from 'lucide-react'
import type { NavKey } from '@/lib/nav'
import type { OverlayUrls } from '@shared/types'
import { CanvasConfig, DEFAULT_CANVAS_CONFIG } from '@shared/canvasConfig'
import { useTour } from '@/providers/TourProvider'
import { buildNodeMap, incoming, lastOfType, migrateLegacyModifierEdges, migrateLegacyAudioPlayerEdges, SAMPLE_ALERT_VARS, SAMPLE_AUDIO_VARS, audioContentValues, hasAudioCover, sceneTrigger, sceneAudioTrigger, animationFallbackMs, maxExitDurationMs, interpolate, hexToRgba, modifierStyle, borderStyle, animationAttrs, PROCESS_TYPES, CONTAINER_TYPES, nextProcessNode, displayEdges, minimapNodeColor, layoutGraph, sortNodesForParenting, buildProcessSchedule, handleScreenCenter, processChainNodes, pointOnBezier, processTokenChain, processTokenPosition, processExitBufferMs, processTrigger, computeTaskState, orderingClass, orderingGap, crossAxisFor, boxShapeStyle, MAX_BOX_DEPTH, findBackgroundFx, findBackgroundFxLabel, SaveStatus, NodeMap, Anim, ScheduledTask, TaskState } from "./sceneUtils";
import { TextView, ImageView, VideoView, ContentView, BoxView, BackgroundFxLayer, ScenePreview, ProcessToken, PreviewEventState, OverlayEffectController, overlayEffectScriptsPromise, loadOverlayEffectScripts } from "./views";

/**
 * A brand-new scene starts with one working example instead of a blank
 * canvas: Text wired straight into Scene. Scene is the single output/sink —
 * see SceneNode's own doc comment in components/nodes — so this both shows
 * newcomers the pattern (connect content → Scene) and means the scene
 * already renders something the moment it's created.
 */
const defaultNodes: Node[] = [
  { id: 'scene', type: 'scene', position: { x: 520, y: 140 }, deletable: false, data: {} },
  { id: '1', type: 'text', position: { x: 200, y: 140 }, data: { text: 'Scene Start' } }
]
const defaultEdges: Edge[] = [{ id: 'e-1-scene', source: '1', target: 'scene' }]

/**
 * Every node type available in the editor, grouped by what it does in the
 * graph (see the node-direction doc comment in components/nodes/index.tsx):
 * Content/Layout feed forward toward Scene, Style/Behavior modify whatever
 * they're wired into, Data documents an event feed. Together they cover the
 * real overlay config shapes (shared/overlayConfig.ts / shared/eventsConfig.ts)
 * so any existing scene (now playing, an alert type, random, roulette) can be
 * rebuilt from these. `scene` itself isn't listed — one is created
 * automatically and can't be deleted, so there's never a second to add.
 */
const NODE_PALETTE: { type: string; label: string; group: string }[] = [
  { type: 'text', label: 'Text', group: 'Content' },
  { type: 'image', label: 'Image', group: 'Content' },
  { type: 'video', label: 'Video', group: 'Content' },
  { type: 'box', label: 'Shape', group: 'Content' },
  { type: 'group', label: 'Group', group: 'Content' },
  // Matches the Transform socket's own `accepts` list (see MODIFIER_SOCKETS
  // in components/nodes/index.tsx) — these three are exactly what a Text/
  // Image/Video/Box/Task's single Transform input now takes.
  { type: 'position', label: 'Position', group: 'Transform' },
  { type: 'size', label: 'Size', group: 'Transform' },
  { type: 'transform', label: 'Transform', group: 'Transform' },
  // Matches the Style socket's own `accepts` list.
  { type: 'opacity', label: 'Opacity', group: 'Style' },
  { type: 'shadow', label: 'Shadow', group: 'Style' },
  { type: 'animation', label: 'Animation', group: 'Style' },
  { type: 'hide', label: 'Hide', group: 'Style' },
  // Matches Box/Scene's own Layout socket (formerly labeled "Ordering") —
  // the only node type it accepts.
  { type: 'ordering', label: 'Ordering', group: 'Layout' },
  { type: 'start', label: 'Start', group: 'Process' },
  { type: 'task', label: 'Task', group: 'Process' },
  { type: 'wait', label: 'Wait', group: 'Process' },
  { type: 'end', label: 'End', group: 'Process' },
  { type: 'sound', label: 'Sound', group: 'Behavior' },
  { type: 'timer', label: 'Timer', group: 'Behavior' },
  { type: 'backgroundAnimation', label: 'Background FX', group: 'Behavior' },
  { type: 'event', label: 'Event', group: 'Data' },
  { type: 'randomSource', label: 'Random', group: 'Data' },
  { type: 'rouletteSource', label: 'Roulette', group: 'Data' },
  { type: 'audioPlayer', label: 'Audio Player', group: 'Data' },
  { type: 'frame', label: 'Layout Frame', group: 'Utils' }
]
const PALETTE_GROUPS = [...new Set(NODE_PALETTE.map((entry) => entry.group))]
/** Drag-to-resize bounds (px) for the live preview panel — see handlePreviewResizeStart. */
const MIN_PREVIEW_WIDTH = 160
const MAX_PREVIEW_WIDTH = 720
const DEFAULT_PREVIEW_WIDTH = 320
/** localStorage key for the preview's remembered width — same 'maddoner:*' convention as ThemeProvider/I18nProvider's own persisted preferences. */
const PREVIEW_WIDTH_STORAGE_KEY = 'maddoner:sceneBuilderPreviewWidth'

export function SceneBuilderPage({
  customOverlayId,
  onNavigate
}: {
  customOverlayId?: string
  onNavigate: (key: NavKey) => void
}) {
  const { resolvedThemeId, themes } = useTheme()
  const isDark = themes.find((t) => t.id === resolvedThemeId)?.mode === 'dark'

  const { overlays, saveOverlay, deleteOverlay, testOverlay } = useCustomOverlays()
  const { start: startTour } = useTour()

  const overlay = customOverlayId ? overlays.find(o => o.id === customOverlayId) : undefined

  const [nodes, setNodes] = useState<Node[]>(defaultNodes)
  const [edges, setEdges] = useState<Edge[]>(defaultEdges)
  const [nameInput, setNameInput] = useState('')
  const [urlKeyInput, setUrlKeyInput] = useState('')
  const [urlKeyError, setUrlKeyError] = useState<string | null>(null)
  /**
   * Permalink-style follow: while false, the URL key auto-updates to track
   * the Name as you type it (see the name input's onChange below), so the
   * page address matches the scene name by default. The moment the URL key
   * field itself is edited it locks (true) and stops following further name
   * edits, protecting a Browser Source already pointed at that address from
   * silently breaking on a later rename.
   */
  const [urlKeyLocked, setUrlKeyLocked] = useState(false)
  const [urls, setUrls] = useState<OverlayUrls | null>(null)
  // Every Add Node group starts collapsed — the palette lists every node
  // type across every group up front otherwise, which is a lot to scan past
  // just to find one node in one group.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PALETTE_GROUPS.map((group) => [group, true]))
  )
  const [playToken, setPlayToken] = useState(0)
  /**
   * Phase of a simulated (Play) event for an event-triggered Scene — see
   * sceneTrigger. 'idle': waiting, nothing rendered. 'showing': revealed,
   * entrance played. 'hiding': exit animation playing (content stays
   * mounted so it can) — see maxExitDurationMs and PreviewEventState.
   */
  const [eventPhase, setEventPhase] = useState<'idle' | 'showing' | 'hiding'>('idle')
  const [eventVars, setEventVars] = useState<Record<string, unknown> | null>(null)
  const eventHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eventIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Captured via onInit below — SceneBuilderPage renders <ReactFlow> itself rather than being a descendant of it, so useReactFlow() isn't available here directly; this ref is the standard workaround for reaching imperative methods (fitView, see handlePrettify) from outside the flow tree. */
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null)

  /**
   * Width (px) of the canvas wrapper itself — NOT window.innerWidth, since
   * this page sits next to the app's own sidebar/titlebar chrome and the
   * three floating toolbar/palette/preview <Panel>s are positioned relative
   * to this element, not the viewport. The three panels have no knowledge of
   * each other's size (React Flow's Panel does plain corner positioning, no
   * collision avoidance), so at narrow widths the centered toolbar's own
   * min-width runs into the pinned side panels and gets painted over by
   * whichever renders later in the DOM — see isCompact/isNarrow below for
   * the fix. null until the first ResizeObserver callback fires, in which
   * case every panel renders at its normal (wide-window) layout rather than
   * flashing hidden for one frame.
   */
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = canvasWrapperRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width != null) setContainerWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  /**
   * Below this, the top-right live preview is hidden — it's a decorative
   * mirror of the real overlay (Test/Play already exercise the real thing),
   * the first thing worth giving up when space is tight. The centered
   * toolbar is a fixed 27rem (432px, see its own className comment) so it
   * clears BOTH side panels at once (Add Node ~200px + preview ~336px)
   * only once the canvas is roughly 432 + 2*216 + margins ≈ 1120px —
   * that's where this threshold comes from, not an arbitrary guess.
   */
  const isCompact = containerWidth !== null && containerWidth < 1120
  /**
   * Below this, even the Add Node palette (already the narrowest of the
   * three panels) collapses into a toggle button — see the paletteOpen
   * state below. Toolbar (fixed 432px) + Add Node alone still need
   * roughly 432 + 2*200 ≈ 830px to clear each other; the app's own
   * default window (960px, minus the sidebar) lands right in this range,
   * which is exactly the overlap this was written to fix — this isn't
   * just a "very narrow window" edge case.
   */
  const isNarrow = containerWidth !== null && containerWidth < 850
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  /**
   * Width (px) of the live preview box — height follows automatically via
   * its own `aspectRatio` CSS (see the preview canvas div below), so
   * dragging the resize handle can't get the proportions wrong. Persisted
   * across sessions the same way theme/locale are (see ThemeProvider/
   * I18nProvider's own 'maddoner:*' localStorage keys) since it's a pure
   * per-user display preference, not scene content.
   */
  const [previewWidth, setPreviewWidth] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(PREVIEW_WIDTH_STORAGE_KEY))
      return Number.isFinite(stored) && stored >= MIN_PREVIEW_WIDTH && stored <= MAX_PREVIEW_WIDTH ? stored : DEFAULT_PREVIEW_WIDTH
    } catch {
      return DEFAULT_PREVIEW_WIDTH
    }
  })
  const previewResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  /**
   * The preview panel is anchored top-right (position="top-right"), so its
   * top and right edges never move — only a drag on its BOTTOM-LEFT corner
   * reads naturally as "resize" here, growing/shrinking by moving the left
   * edge left/right while width (and, via aspect-ratio, height) follow.
   * Tracked via window-level listeners rather than the handle's own
   * onMouseMove, since the pointer easily outruns a 14px grip mid-drag.
   */
  const handlePreviewResizeStart = (event: React.MouseEvent): void => {
    event.preventDefault()
    previewResizeRef.current = { startX: event.clientX, startWidth: previewWidth }
    const onMove = (moveEvent: MouseEvent): void => {
      const drag = previewResizeRef.current
      if (!drag) return
      const next = drag.startWidth + (drag.startX - moveEvent.clientX)
      setPreviewWidth(Math.min(MAX_PREVIEW_WIDTH, Math.max(MIN_PREVIEW_WIDTH, next)))
    }
    const onUp = (): void => {
      previewResizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setPreviewWidth((width) => {
        try {
          localStorage.setItem(PREVIEW_WIDTH_STORAGE_KEY, String(width))
        } catch {
          // Preview size just won't persist across restarts in this environment.
        }
        return width
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /** Current playhead (ms) of a simulated Process run (see buildProcessSchedule) — advanced via rAF by handlePlay, consumed by ScenePreview/BoxView/ContentView through computeTaskState. Only meaningful while eventPhase is 'showing' for a Scene with a Start node. The process itself lives directly in nodes/edges (Start/Task/Wait/End are graph nodes) — no separate state to load/save. */
  const [processClockMs, setProcessClockMs] = useState(0)
  const processRafRef = useRef<number | null>(null)
  /** Pending setTimeouts for a simulated Process run's own per-Task Sound previews (see TASK_SOCKETS' own doc comment in components/nodes/index.tsx) — tracked and cleared on every new Play so pressing it again mid-run can't leave an old run's sounds to fire late on top of the new one. */
  const taskSoundTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    window.maddoner.getOverlayUrls().then(setUrls)
  }, [])

  const [canvasConfig, setCanvasConfig] = useState<CanvasConfig>(DEFAULT_CANVAS_CONFIG)
  useEffect(() => {
    window.maddoner.getCanvasConfig().then(setCanvasConfig)
  }, [])

  useEffect(() => {
    return () => {
      if (processRafRef.current != null) cancelAnimationFrame(processRafRef.current)
      taskSoundTimersRef.current.forEach(clearTimeout)
    }
  }, [])

  useEffect(() => {
    if (overlay) {
      const isBlank = !overlay.nodes || overlay.nodes.length === 0
      setNodes(isBlank ? defaultNodes : sortNodesForParenting(overlay.nodes))
      setEdges(isBlank ? defaultEdges : migrateLegacyAudioPlayerEdges(migrateLegacyModifierEdges(overlay.edges || [])))
      setNameInput(overlay.name)
      setUrlKeyInput(overlay.urlKey)
      setUrlKeyError(null)
      // A urlKey that doesn't match what a fresh slugify(name) would produce
      // means it was deliberately customized (or auto-suffixed for a
      // collision) at some point — treat that as already locked rather than
      // silently resyncing it the next time the name changes.
      setUrlKeyLocked(overlay.urlKey !== slugify(overlay.name))
    } else {
      setNodes(defaultNodes)
      setEdges(defaultEdges)
    }
  }, [overlay?.id])

  const commitName = (): void => {
    if (!overlay) return
    const name = nameInput.trim()
    if (!name) {
      setNameInput(overlay.name)
      return
    }
    setNameInput(name)

    // Still following: the URL key moves with the name, same as the live
    // preview while typing (see the name input's onChange) — recomputed here
    // (rather than trusting urlKeyInput) so it reflects the final trimmed
    // name and a fresh uniqueness check.
    if (!urlKeyLocked) {
      const key = uniqueUrlKey(name, overlays.filter((o) => o.id !== overlay.id).map((o) => o.urlKey))
      setUrlKeyInput(key)
      if (name === overlay.name && key === overlay.urlKey) return
      void saveOverlay({ ...overlay, name, urlKey: key })
      return
    }

    if (name === overlay.name) return
    void saveOverlay({ ...overlay, name })
  }

  const commitUrlKey = (): void => {
    if (!overlay) return
    const key = slugify(urlKeyInput)
    if (key === overlay.urlKey) {
      setUrlKeyInput(key)
      setUrlKeyError(null)
      return
    }
    if (overlays.some((o) => o.id !== overlay.id && o.urlKey === key)) {
      setUrlKeyError('This key is already used by another scene.')
      return
    }
    setUrlKeyInput(key)
    setUrlKeyError(null)
    void saveOverlay({ ...overlay, urlKey: key })
  }

  const handleDelete = async (): Promise<void> => {
    if (!overlay) return
    if (!window.confirm(`Delete scene "${overlay.name}"? This cannot be undone.`)) return
    await deleteOverlay(overlay.id)
    onNavigate('dashboard')
  }

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'error'>('idle')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  /** Persists the current nodes/edges — a Start/Task/Wait/End process lives directly in them, no separate state to save. */
  const handleSave = async (): Promise<void> => {
    if (!overlay) return
    setSaveStatus('saving')
    try {
      await saveOverlay({ ...overlay, nodes, edges })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1500)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }

  /**
   * One-shot auto-arrange via layoutGraph (dagre) — only touches local
   * editor state (`nodes`), same as dragging a node by hand; nothing is
   * persisted until Save, so it's always safe to try and undo by just not
   * saving. The double rAF before fitView gives React (and ReactFlow's own
   * internal node measurement) one full paint cycle to actually apply the
   * new positions before the camera tries to frame them — calling fitView
   * synchronously right after setNodes would still see the OLD layout.
   */
  const handlePrettify = (): void => {
    setNodes((nds) => layoutGraph(nds, edges))
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        reactFlowInstanceRef.current?.fitView({ duration: 300, padding: 0.15 })
      })
    })
  }

  /**
   * Plays the preview once: bumps playToken (remounts every animated node —
   * see the playToken-keyed lists in ScenePreview/BoxView — which is what
   * actually restarts their CSS entrance animation) and fires whatever Sound
   * node is wired into Scene/Start, the same bundled-preset URL scheme as
   * AlertSoundPicker's own preview button.
   *
   * A Start node (processTrigger) takes priority over the plain
   * Event+Timer→Scene model (sceneTrigger), which itself takes priority over
   * Audio-Player-driven visibility (sceneAudioTrigger) — see the doc comment
   * on nodeTypes in components/nodes/index.tsx. Either way this simulates
   * the event: for a Process, advances processClockMs via rAF from 0 to the
   * schedule's totalMs, each component resolving its own state through
   * computeTaskState; for the plain model (real Event OR Audio Player),
   * the simpler show-for-durationMs-then-play-one-exit-animation flow this
   * already had — sceneAudioTrigger has no real "stop" signal to preview
   * locally (unlike the real overlay's own isPlaying-driven one), so it
   * just reuses sceneTrigger's own 6000ms default. Every case here is the
   * local equivalent of a real alert/track-change arriving, and of what
   * Test simulates for the real overlay (see handleTest /
   * overlays/custom.html's processTrigger/isEventTrigger/isAudioTrigger).
   */
  /** Plays one Sound node's configured preset/custom file — shared by handlePlay's Start/Scene-level preview below and its per-Task one. */
  const playSoundNode = (soundNode: Node | undefined): void => {
    if (!urls) return
    const soundId = (soundNode?.data.soundId as string) || 'none'
    if (soundId === 'none') return
    const customSoundName = soundNode?.data.customSoundName as string | undefined
    if (soundId === 'custom' && !customSoundName) return
    const soundUrl =
      soundId === 'custom'
        ? `http://${urls.host}:${urls.port}/overlays/custom-sounds/${encodeURIComponent(customSoundName!)}`
        : `http://${urls.host}:${urls.port}/overlays/sounds/${soundId}.wav`
    const audio = new Audio(soundUrl)
    audio.volume = (soundNode?.data.volume as number) ?? 1
    void audio.play().catch(() => {})
  }

  const handlePlay = (): void => {
    setPlayToken((t) => t + 1)
    const proc = processTrigger(nodes, edges)
    const trigger = proc.active ? null : sceneTrigger(nodes, edges)
    const audioTrigger = !proc.active && !trigger?.active && sceneAudioTrigger(nodes, edges)
    if (proc.active || trigger?.active || audioTrigger) {
      if (eventHideTimerRef.current) clearTimeout(eventHideTimerRef.current)
      if (eventIdleTimerRef.current) clearTimeout(eventIdleTimerRef.current)
      if (processRafRef.current != null) cancelAnimationFrame(processRafRef.current)
      taskSoundTimersRef.current.forEach(clearTimeout)
      taskSoundTimersRef.current = []
      // Sample data shaped to whichever trigger is actually armed — mirrors
      // render()'s own simulateTest branch in overlays/custom.html: a
      // process armed purely by Audio Player (proc.audioArmed, no Event —
      // see processTrigger) gets Now-Playing-shaped sample vars instead of
      // alert-shaped ones, or a Task's own {title}/{artist} placeholders
      // would just preview as literal text. alertTypes wins when both are
      // wired to the same Start.
      const alertTypes = proc.active ? proc.alertTypes : trigger!.alertTypes
      setEventVars(alertTypes.length > 0 ? { type: alertTypes[0], ...SAMPLE_ALERT_VARS } : { ...SAMPLE_AUDIO_VARS, source: 'spotify', isPlaying: true })
      setEventPhase('showing')
      if (proc.active) {
        const built = buildProcessSchedule(nodes, edges)
        const totalMs = built?.totalMs ?? 0
        // See processExitBufferMs's own doc comment: without the buffer,
        // whichever Task(s) fire at exactly totalMs get cut off before
        // their animation plays a single frame.
        const total = totalMs + processExitBufferMs(built?.schedule ?? [], totalMs)
        const start = performance.now()
        setProcessClockMs(0)
        // Every Task's own Sound (see TASK_SOCKETS' own doc comment in
        // components/nodes/index.tsx), previewed at the same atMs its Task
        // fires at — mirrors showProcessContent's soundsByAtMs in
        // overlays/custom.html, just via setTimeout instead of the rAF
        // clock driving processClockMs (a Sound isn't part of a
        // component's resolved style, so it doesn't need per-frame
        // resolution the way computeTaskState's targets do).
        for (const s of built?.schedule ?? []) {
          const soundMod = s.mods.find((m) => m.type === 'sound')
          if (!soundMod) continue
          if (s.atMs === 0) {
            playSoundNode(soundMod)
          } else {
            taskSoundTimersRef.current.push(setTimeout(() => playSoundNode(soundMod), s.atMs))
          }
        }
        const tick = (now: number): void => {
          const elapsed = now - start
          if (elapsed >= total) {
            setProcessClockMs(total)
            setEventPhase('idle')
            processRafRef.current = null
            return
          }
          setProcessClockMs(elapsed)
          processRafRef.current = requestAnimationFrame(tick)
        }
        processRafRef.current = requestAnimationFrame(tick)
      } else {
        eventHideTimerRef.current = setTimeout(() => {
          setEventPhase('hiding')
          eventIdleTimerRef.current = setTimeout(() => setEventPhase('idle'), maxExitDurationMs(nodes, edges))
        }, trigger!.durationMs)
      }
    }
    const map = buildNodeMap(nodes)
    const start = nodes.find((n) => n.type === 'start')
    const scene = nodes.find((n) => n.type === 'scene')
    const soundNode = start
      ? incoming(start.id, edges, map).find((n) => n.type === 'sound')
      : scene
        ? incoming(scene.id, edges, map).find((n) => n.type === 'sound')
        : nodes.find((n) => n.type === 'sound')
    playSoundNode(soundNode)
  }

  /**
   * Live-previews the CURRENT graph (including anything not yet Saved) in
   * any real OBS Browser Source/browser tab already pointed at this scene's
   * URL — see CustomOverlaysProvider.testOverlay / OverlayServer.testCustomOverlay.
   * Distinct from Save: this replays entrance animations and fires a fresh
   * (non-repeating) Background FX drop, Save deliberately does not — see the
   * doc comment on OverlayServer.setCustomOverlays.
   *
   * Also runs handlePlay's own local simulation (same as clicking Play)
   * so this panel's preview — Task states, ProcessToken included — animates
   * in step with whatever's being pushed to the real page, instead of
   * sitting untouched while Test does its own separate thing. Previously
   * Test was a pure broadcast with no local effect at all: a no-op if
   * nothing was connected (the real overlay's own doc comment on `render`'s
   * `simulateTest` still applies for the OTHER end — this only fixes what
   * happens HERE, in the editor), which looked like "Test doesn't do
   * anything" and, once something WAS connected, made the local Preview and
   * the real page's result impossible to compare side by side since only
   * one of them was ever actually running at a time.
   */
  const handleTest = async (): Promise<void> => {
    if (!overlay) return
    handlePlay()
    setTestStatus('testing')
    try {
      await testOverlay({ ...overlay, nodes, edges })
      setTestStatus('idle')
    } catch {
      setTestStatus('error')
      setTimeout(() => setTestStatus('idle'), 2000)
    }
  }

  const onNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent, node: Node) => {
      const instance = reactFlowInstanceRef.current
      if (!instance || node.type === 'frame') return

      const intersections = instance.getIntersectingNodes(node).filter((n) => n.type === 'frame')
      const targetFrame = intersections[0]

      // Wait for React Flow to finish flushing its position changes (dragging: false)
      setTimeout(() => {
        setNodes((nds) => {
          const getAbsolute = (nId: string) => {
            let curr = nds.find((x) => x.id === nId)
            if (!curr) return { x: 0, y: 0 }
            let x = curr.position.x
            let y = curr.position.y
            while (curr.parentId) {
              curr = nds.find((x) => x.id === curr!.parentId)
              if (!curr) break
              x += curr.position.x
              y += curr.position.y
            }
            return { x, y }
          }

          const absNodePos = getAbsolute(node.id)

          const reparented = nds.map((n) => {
            if (n.id === node.id) {
              if (targetFrame && n.parentId !== targetFrame.id) {
                const absFramePos = getAbsolute(targetFrame.id)
                return {
                  ...n,
                  position: {
                    x: absNodePos.x - absFramePos.x,
                    y: absNodePos.y - absFramePos.y
                  },
                  parentId: targetFrame.id
                }
              } else if (!targetFrame && n.parentId) {
                return {
                  ...n,
                  position: {
                    x: absNodePos.x,
                    y: absNodePos.y
                  },
                  parentId: undefined
                }
              }
            }
            return n
          })

          // A newly-set parentId only helps if the Frame is actually ahead
          // of this node in the array — see sortNodesForParenting's own doc
          // comment for why React Flow silently mispositions the child
          // otherwise (the exact "flies off" bug this fixes).
          return sortNodesForParenting(reparented)
        })
      }, 50) // Use 50ms to ensure onNodesChange has fully executed
    },
    [setNodes]
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds))
    },
    []
  )
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds))
    },
    []
  )
  /**
   * Blender-style single-value sockets: dropping a new wire onto a socket
   * that isn't `multi` (see NODE_SOCKETS in components/nodes) bumps
   * whatever was already plugged into it instead of stacking both — same
   * behavior Blender uses for single-value inputs. `multi` sockets (Box's
   * Children, Scene's Content) accept any number of wires unchanged. The
   * process sequence-flow socket (event-in) isn't in NODE_SOCKETS but is
   * conceptually single too — a step has exactly one predecessor.
   */
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const targetNode = nodes.find((n) => n.id === params.target)
        const socket = targetNode ? NODE_SOCKETS[targetNode.type!]?.find((s) => s.id === params.targetHandle) : undefined
        const multi = params.targetHandle !== 'event-in' && Boolean(socket?.multi)
        const base = multi ? eds : eds.filter((e) => !(e.target === params.target && e.targetHandle === params.targetHandle))
        return addEdge(params, base)
      })
    },
    [nodes]
  )

  /**
   * Keeps the Event socket (sequence flow, id "event-in" — see BaseNode's
   * sequenceIn) strictly for connecting one process step to the next: only
   * a Start/Task/Wait/End can feed it. Every other socket is validated
   * against NODE_SOCKETS' accepts list for the target node's type/socket —
   * the same list BaseNode itself reads to render each socket, so a process
   * node's output (never in any accepts list) naturally can't land on a
   * plain parameter socket either, without needing a separate check. For a
   * source node with its own NODE_OUTPUTS (Text/Image/Box), the SPECIFIC
   * output socket used also has to list the target socket in its `feeds` —
   * e.g. dragging from Box's "As Target" dot can only land on a Task's
   * Target socket, not Scene's Content, even though a plain Box is
   * otherwise allowed there via the "Structural" output.
   */
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)
      if (!sourceNode || !targetNode) return false
      if (connection.targetHandle === 'event-in') return PROCESS_TYPES.has(sourceNode.type!)
      const socket = NODE_SOCKETS[targetNode.type!]?.find((s) => s.id === connection.targetHandle)
      if (!socket || !socket.accepts.includes(sourceNode.type!)) return false
      const outputSockets = NODE_OUTPUTS[sourceNode.type!]
      if (outputSockets) {
        const outSocket = outputSockets.find((o) => o.id === connection.sourceHandle)
        if (!outSocket || !outSocket.feeds.includes(connection.targetHandle!)) return false
      }
      // Box and Group can each nest either one (see BOX_SOCKETS' own doc
      // comment in components/nodes/index.tsx) — the one connection shape in
      // this whole graph that CAN form a cycle (A contains B contains A),
      // which would recurse forever in BoxView/buildBox. Reject a
      // container→container `children` connection if the target is already
      // a descendant of the source — i.e. the source already (transitively)
      // contains the target, so wiring the target to also contain the
      // source would close the loop.
      if (CONTAINER_TYPES.has(sourceNode.type!) && CONTAINER_TYPES.has(targetNode.type!) && connection.targetHandle === 'children') {
        const stack = [sourceNode.id]
        const seen = new Set<string>()
        while (stack.length) {
          const id = stack.pop()!
          if (id === targetNode.id) return false
          if (seen.has(id)) continue
          seen.add(id)
          for (const e of edges) {
            if (e.target === id && e.targetHandle === 'children' && CONTAINER_TYPES.has(nodes.find((n) => n.id === e.source)?.type ?? '')) {
              stack.push(e.source)
            }
          }
        }
      }
      return true
    },
    [nodes, edges]
  )

  const onEdgeDoubleClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setEdges((eds) => eds.filter((e) => e.id !== edge.id))
    },
    []
  )

  const addNode = (type: string, position: { x: number; y: number }) => {
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      // Spread a fresh copy of NODE_DEFAULTS[type] (rather than the same
      // object reference) so editing this node's data can never mutate the
      // shared defaults for every other node of this type.
      data: { ...(NODE_DEFAULTS[type] ?? {}) },
      zIndex: type === 'frame' ? -1 : undefined
    }
    setNodes((nds) => [...nds, newNode])
  }

  // Drag-and-drop from the Add Node palette — see the palette buttons'
  // draggable/onDragStart below and the canvas wrapper's onDrop/onDragOver.
  // The palette button's own type is passed via dataTransfer rather than
  // closed over, since the drop handler is bound once on the canvas
  // wrapper, not per palette entry.
  const onPaletteDragStart = (event: React.DragEvent, type: string) => {
    event.dataTransfer.setData('application/reactflow', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onCanvasDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onCanvasDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/reactflow')
      if (!type || !reactFlowInstanceRef.current) return
      const position = reactFlowInstanceRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      })
      addNode(type, position)
    },
    []
  )

  if (!overlay) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
        <Workflow className="w-16 h-16 mb-4 opacity-50" />
        <h2 className="text-xl font-semibold text-foreground">No Scene Selected</h2>
        <p className="mt-2 text-center max-w-sm">
          Please select an overlay from the sidebar or create a new one using the "+" button under "Overlays".
        </p>
      </div>
    )
  }

  const backgroundFxNode = findBackgroundFx(nodes, edges)
  // A Start node (processTrigger) takes priority over the plain
  // Event+Timer→Scene model (sceneTrigger), which itself takes priority
  // over Audio-Player-driven visibility (sceneAudioTrigger) — see the doc
  // comment on nodeTypes in components/nodes/index.tsx.
  const proc = processTrigger(nodes, edges)
  const trigger = proc.active ? null : sceneTrigger(nodes, edges)
  const audioTrigger = !proc.active && !trigger?.active && sceneAudioTrigger(nodes, edges)
  const eventActive = proc.active || Boolean(trigger?.active) || audioTrigger
  const eventState: PreviewEventState = {
    active: eventActive,
    visible: eventPhase !== 'idle',
    hiding: eventPhase === 'hiding',
    vars: eventActive ? eventVars : null,
    alertTypes: proc.active ? proc.alertTypes : (trigger?.alertTypes ?? [])
  }
  const processBuilt = proc.active ? buildProcessSchedule(nodes, edges) : null
  const processSchedule = processBuilt?.schedule ?? []
  // Real length (ms) of a running Process preview, totalMs plus the same
  // exit-animation buffer handlePlay's own rAF loop runs the clock out to —
  // what ProcessToken's clockMs is counted against (see its own doc
  // comment), so the token finishes crossing the whole chain exactly as the
  // preview run actually ends instead of drifting out of sync with it.
  const processDurationMs = proc.active ? (processBuilt?.totalMs ?? 0) + processExitBufferMs(processSchedule, processBuilt?.totalMs ?? 0) : 0
  // Background FX cuts instantly on hide rather than riding out the content's
  // exit animation — mirrors overlays/custom.html's hideTriggeredContent,
  // which calls applyBackgroundFx(undefined, ...) before playExitAnimations.
  const previewPlayed = eventState.active ? eventPhase === 'showing' : playToken > 0

  return (
    <div
      ref={canvasWrapperRef}
      className="w-full h-full relative bg-background"
      data-tour="scene-builder-canvas"
      onDragOver={onCanvasDragOver}
      onDrop={onCanvasDrop}
    >
      <SavedNodeDataProvider savedNodes={overlay.nodes}>
      <ReactFlow
          nodes={nodes}
          edges={displayEdges(nodes, edges)}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          // Default is 20px — bumped up since sockets are small, densely
          // labeled rows (see SocketRow/OutputRow in components/nodes/
          // index.tsx): this is how forgiving the DROP end of a drag is,
          // once it's already under way (the .react-flow__handle::after
          // rule in scene-builder-canvas.css is what forgives the START).
          connectionRadius={40}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance
          }}
          nodeTypes={nodeTypes}
          colorMode={isDark ? 'dark' : 'light'}
          fitView
          className="bg-background"
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={minimapNodeColor}
            maskColor="rgba(0, 0, 0, 0.6)"
            pannable
            zoomable
            className="!bg-card !border !border-border"
          />
          <ProcessToken nodes={nodes} edges={edges} clockMs={processClockMs} durationMs={processDurationMs} active={proc.active && eventPhase === 'showing'} />
          {/* Floating toolbar — name, URL key, and the save/prettify/test/help/delete actions — centered above the canvas instead of a full-width bar above it, now that the canvas itself fills the whole page. Delete sits apart from the rest (top-right, next to the name) since it's destructive and shouldn't be one click away from Save/Prettify/Test/Help, which live together in a footer row instead. */}
          {/*
            w-[27rem], not min-w: a shrink-to-fit (auto) width here made the
            URL-key row's own flex-wrap useless — an auto-width flex-col
            parent sizes itself off row 1/3's shorter content, then row 2
            (label + url-key input + the CopyableUrl address, which needs
            ~27rem to lay out on one line) gets stretched to that narrower
            auto-computed width and simply overflows past this panel's own
            edge instead of wrapping, since flex-wrap only wraps against a
            container's REAL resolved width, not one still being
            auto-computed from shorter sibling rows. An explicit width
            removes that ambiguity — 27rem is row 2's own natural width, so
            normally nothing wraps and the URL shows in full; max-w clamps
            it smaller on a narrow canvas, and THEN flex-wrap correctly
            drops the URL box to its own line within that resolved width
            (see isNarrow/isCompact's own doc comment for how the two
            side panels' collapse thresholds account for this width).
          */}
          <Panel position="top-center" className="mt-3 w-[27rem] max-w-[calc(100%-2rem)] bg-card border rounded-xl shadow-md px-4 py-3.5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <input
                value={nameInput}
                onChange={(e) => {
                  const value = e.target.value
                  setNameInput(value)
                  if (!urlKeyLocked) setUrlKeyInput(slugify(value))
                }}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') {
                    setNameInput(overlay.name)
                    if (!urlKeyLocked) setUrlKeyInput(overlay.urlKey)
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
                aria-label="Scene name"
                className="min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-tight text-foreground outline-none border-b border-transparent rounded-sm px-0.5 -mx-0.5 hover:border-border focus:border-primary transition-colors"
              />
              <button
                onClick={() => void handleDelete()}
                title="Delete Scene"
                className="flex items-center justify-center p-2 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-muted-foreground shrink-0" htmlFor="scene-url-key" title="URL key">
                  URL key:
                </label>
                <input
                  id="scene-url-key"
                  value={urlKeyInput}
                  onChange={(e) => {
                    setUrlKeyLocked(true)
                    setUrlKeyInput(e.target.value)
                  }}
                  onBlur={commitUrlKey}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  className="bg-muted border rounded px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-primary w-24 shrink-0"
                />
                {urls && (
                  <div className="min-w-0 flex-1" data-tour="scene-builder-url">
                    <CopyableUrl
                      url={`${urls.customBase}/${encodeURIComponent(overlay.urlKey)}.html`}
                      className="max-w-[220px]"
                    />
                  </div>
                )}
              </div>
              {urlKeyError && <p className="text-xs text-destructive">{urlKeyError}</p>}
            </div>

            <div className="flex items-center justify-between pt-2.5 border-t" data-tour="scene-builder-save">
              <button
                onClick={handlePrettify}
                title="Prettify — auto-arranges the node graph for readability (dagre layered layout). Only rearranges nodes locally; Save to keep it."
                className="flex items-center justify-center p-2 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Sparkles className="size-4" />
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => void handleSave()}
                  disabled={saveStatus === 'saving'}
                  className={cn(
                    'flex items-center gap-1.5 text-sm font-semibold py-2 px-3.5 rounded-md transition-colors disabled:cursor-wait',
                    saveStatus === 'saved' && 'bg-green-600 hover:bg-green-600 text-white',
                    saveStatus === 'error' && 'bg-destructive hover:bg-destructive text-destructive-foreground',
                    (saveStatus === 'idle' || saveStatus === 'saving') && 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  )}
                >
                  {saveStatus === 'saved' && <Check className="size-4" />}
                  {saveStatus === 'error' && <X className="size-4" />}
                  {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : 'Save'}
                </button>
                <button
                  onClick={() => void handleTest()}
                  disabled={testStatus === 'testing'}
                  title="Test — plays this scene (including unsaved changes) live in any connected Browser Source, without saving"
                  className={cn(
                    'flex items-center justify-center p-2 rounded-md border transition-colors disabled:cursor-wait',
                    testStatus === 'error'
                      ? 'border-destructive/30 text-destructive hover:bg-destructive/10'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {testStatus === 'error' ? <X className="size-4" /> : <FlaskConical className="size-4" />}
                </button>
              </div>
              <button
                onClick={() => startTour('sceneBuilder')}
                title="Tutorial — a detailed walkthrough of Scene Builder's own mechanics"
                className="flex items-center justify-center p-2 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <HelpCircle className="size-4" />
              </button>
            </div>
          </Panel>
          {/* max-h leaves real clearance at the bottom for <Controls> (also bottom-left, ~9rem tall including its own margin) — a smaller, reliably-scrollable panel instead of one that stretches to nearly the full canvas height and overlaps it.
              Below isNarrow, the panel itself collapses to just a toggle button (paletteOpen) instead of staying permanently pinned — freeing up the width the centered toolbar above needs so the two stop painting over each other on a narrow window (see containerWidth's own doc comment). */}
          <Panel position="top-left" data-tour="scene-builder-add-node" className="m-4 flex flex-col items-start gap-2">
            {isNarrow && (
              <button
                type="button"
                onClick={() => setPaletteOpen((open) => !open)}
                title={paletteOpen ? 'Hide node palette' : 'Show node palette'}
                className="flex items-center justify-center p-2.5 rounded-lg border bg-card shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <PanelLeft className="size-4" />
              </button>
            )}
            {(!isNarrow || paletteOpen) && (
              <div className="bg-card border rounded-lg shadow-sm flex flex-col min-w-[170px] max-h-[min(28rem,calc(100%_-_9rem))] overflow-hidden">
                <div className="p-2.5 border-b bg-card shrink-0">
                  <h3 className="font-semibold text-sm text-center">Add Node</h3>
                </div>
                <ScrollArea className="flex-1 min-h-0 my-3">
                  <div className="flex flex-col gap-1 px-3">
                    {PALETTE_GROUPS.map((group) => {
                      const entries = NODE_PALETTE.filter((entry) => entry.group === group)
                      const isOpen = !collapsedGroups[group]
                      // Every entry in a palette group shares one NodeCategory
                      // (e.g. "Transform" is entirely 'style', "Data" entirely
                      // 'data') — see NODE_CATEGORY's own doc comment — so one
                      // lookup colors both the group header and every button in
                      // it, matching the exact tint/accent that node gets once
                      // it's actually placed on the canvas (BaseNode's own
                      // header styling, CATEGORY_STYLES in components/nodes).
                      const categoryStyle = CATEGORY_STYLES[NODE_CATEGORY[entries[0].type]]
                      return (
                        <div key={group} className="flex flex-col gap-1">
                          <button
                            onClick={() => setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }))}
                            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground cursor-pointer py-0.5"
                          >
                            <ChevronRight className={cn('size-3 transition-transform', isOpen && 'rotate-90')} />
                            <span className={cn('size-1.5 rounded-full shrink-0', categoryStyle.dot)} />
                            {group}
                          </button>
                          {isOpen &&
                            entries.map((entry) => (
                              <button
                                key={entry.type}
                                type="button"
                                draggable
                                onDragStart={(e) => onPaletteDragStart(e, entry.type)}
                                title="Drag onto the canvas to add"
                                className={cn(
                                  'text-xs py-2 px-3 rounded border-l-4 transition-all text-left border border-transparent hover:border-border hover:brightness-110 cursor-grab active:cursor-grabbing',
                                  categoryStyle.header,
                                  categoryStyle.border
                                )}
                              >
                                {entry.label}
                              </button>
                            ))}
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
          </Panel>
          {/* Below isCompact, this collapses to just a toggle button (previewOpen) instead of vanishing outright — same pattern as the Add Node palette above, so there's always a visible way to bring it back rather than it just disappearing. */}
          <Panel position="top-right" data-tour="scene-builder-preview" className="m-4 flex flex-col items-end gap-2">
            {isCompact && (
              <button
                type="button"
                onClick={() => setPreviewOpen((open) => !open)}
                title={previewOpen ? 'Hide preview' : 'Show preview'}
                className="flex items-center justify-center p-2.5 rounded-lg border bg-card shadow-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <PanelRight className="size-4" />
              </button>
            )}
            {(!isCompact || previewOpen) && (
            <div
              className="scene-preview-canvas isolate border border-border rounded-lg overflow-hidden relative flex items-center justify-center pointer-events-none opacity-90"
              style={{
                width: previewWidth,
                aspectRatio: canvasConfig.aspectRatio === 'custom'
                  ? `${canvasConfig.width}/${canvasConfig.height}`
                  : canvasConfig.aspectRatio.replace(':', '/')
              }}
            >
              <div className="absolute z-10 top-2 right-2 flex items-center gap-1.5 bg-black/70 rounded-full pl-2.5 pr-1 py-1">
                <span className="text-white text-xs font-medium">Preview</span>
                <button
                  type="button"
                  onClick={handlePlay}
                  title="Play animations & sound"
                  className="pointer-events-auto flex items-center justify-center size-5 rounded-full bg-white/15 text-white hover:bg-white/30 transition-colors cursor-pointer"
                >
                  <Play className="size-3 fill-current" />
                </button>
              </div>
              {/* Bottom-left corner: the one corner that actually moves as this top-right-anchored box grows/shrinks — see handlePreviewResizeStart's own doc comment. */}
              <div
                onMouseDown={handlePreviewResizeStart}
                title="Drag to resize preview"
                className="pointer-events-auto absolute z-10 bottom-0 left-0 size-4 cursor-sw-resize flex items-end justify-start p-0.5 opacity-60 hover:opacity-100 transition-opacity"
              >
                <div className="size-2 border-b-2 border-l-2 border-white/80 rounded-bl-sm" />
              </div>
              <div
                // shrink-0 is the actual fix (see the diagnostic session
                // that found this): this div is a flex ITEM of the
                // .scene-preview-canvas flex container above (width:
                // previewWidth, user-resizable — see handlePreviewResizeStart).
                // Without shrink-0, flexbox's default flex-shrink:1
                // compresses this box's WIDTH down to fit that container
                // BEFORE the scale() transform below even runs — squashing
                // it down from the real 1920px, while height stays correct
                // (cross-axis, unaffected by flex-shrink under
                // items-center). Content that just centers within whatever
                // width it gets (the alert box) tolerated this well enough
                // to look "mostly fine"; a percentage-sized background
                // (background-size: 200% 200%, the 'gradient' Background FX
                // type) is far more sensitive to the exact width and
                // rendered as a narrow off-proportion band instead of a
                // full-canvas sweep.
                className="relative origin-center overflow-hidden shrink-0"
                style={{
                  width: canvasConfig.width,
                  height: canvasConfig.height,
                  transform: `scale(${previewWidth / canvasConfig.width})`
                }}
              >
                <BackgroundFxLayer
                  node={backgroundFxNode}
                  label={findBackgroundFxLabel(backgroundFxNode, nodes, edges, eventState.vars)}
                  urls={urls}
                  playToken={playToken}
                  played={previewPlayed}
                />
                <ScenePreview
                  nodes={nodes}
                  edges={edges}
                  playToken={playToken}
                  eventState={eventState}
                  schedule={processSchedule}
                  clockMs={processClockMs}
                  urls={urls}
                />
              </div>
            </div>
            )}
          </Panel>
        </ReactFlow>
      </SavedNodeDataProvider>
    </div>
  )
}
