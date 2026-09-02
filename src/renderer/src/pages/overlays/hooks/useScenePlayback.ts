import { useEffect, useRef, useState } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { CustomOverlay, OverlayUrls } from '@shared/types'
import {
  buildNodeMap,
  incoming,
  sceneTrigger,
  sceneAudioTrigger,
  processTrigger,
  buildProcessSchedule,
  processExitBufferMs,
  maxExitDurationMs,
  SAMPLE_ALERT_VARS,
  SAMPLE_AUDIO_VARS,
  SAMPLE_ROULETTE_VARS
} from '../sceneUtils'

/**
 * Drives the local Play/Test simulation — the same "an event/track-change/
 * round-start just arrived" preview whether triggered by the panel's own
 * Play button or by Test (which additionally broadcasts to any real
 * connected Browser Source; see handleTest below). A Start node
 * (processTrigger) takes priority over the plain Event+Timer→Scene model
 * (sceneTrigger), which itself takes priority over Audio-Player-driven
 * visibility (sceneAudioTrigger) — see the doc comment on nodeTypes in
 * components/nodes/index.tsx. Roulette has no scene-wide equivalent of its
 * own (see ROULETTE_OUTPUTS' own doc comment in components/nodes/
 * constants.ts) — only `proc.rouletteArmed` below, for a Start-armed process.
 */
export function useScenePlayback({
  overlay,
  nodes,
  edges,
  urls,
  testOverlay
}: {
  overlay: CustomOverlay | undefined
  nodes: Node[]
  edges: Edge[]
  urls: OverlayUrls | null
  testOverlay: (overlay: CustomOverlay) => Promise<void>
}) {
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

  /** Current playhead (ms) of a simulated Process run (see buildProcessSchedule) — advanced via rAF by handlePlay, consumed by ScenePreview/BoxView/ContentView through computeTaskState. Only meaningful while eventPhase is 'showing' for a Scene with a Start node. The process itself lives directly in nodes/edges (Start/Task/Wait/End are graph nodes) — no separate state to load/save. */
  const [processClockMs, setProcessClockMs] = useState(0)
  const processRafRef = useRef<number | null>(null)
  /** Pending setTimeouts for a simulated Process run's own per-Task Sound previews (see TASK_SOCKETS' own doc comment in components/nodes/index.tsx) — tracked and cleared on every new Play so pressing it again mid-run can't leave an old run's sounds to fire late on top of the new one. */
  const taskSoundTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    return () => {
      if (processRafRef.current != null) cancelAnimationFrame(processRafRef.current)
      taskSoundTimersRef.current.forEach(clearTimeout)
    }
  }, [])

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

  /**
   * Plays the preview once: bumps playToken (remounts every animated node —
   * see the playToken-keyed lists in ScenePreview/BoxView — which is what
   * actually restarts their CSS entrance animation) and fires whatever Sound
   * node is wired into Scene/Start, the same bundled-preset URL scheme as
   * AlertSoundPicker's own preview button.
   *
   * Either way this simulates the event: for a Process, advances
   * processClockMs via rAF from 0 to the schedule's totalMs, each component
   * resolving its own state through computeTaskState; for the plain model
   * (real Event OR Audio Player), the simpler show-for-durationMs-then-play-
   * one-exit-animation flow this already had — sceneAudioTrigger has no real
   * "stop" signal to preview locally (unlike the real overlay's own
   * isPlaying-driven one), so it just reuses sceneTrigger's own 6000ms
   * default. Every case here is the local equivalent of a real
   * alert/track-change arriving, and of what Test simulates for the real
   * overlay (see handleTest / overlays/custom.html's own
   * processTrigger/isEventTrigger/isAudioTrigger).
   */
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
      // see processTrigger) gets Now-Playing-shaped sample vars, one armed
      // purely by Roulette (proc.rouletteArmed) gets round-shaped sample
      // vars, or a Task's own {title}/{artist}/{entrants}/{winner}
      // placeholders would just preview as literal text. alertTypes wins
      // over audio, which wins over roulette, when more than one is wired
      // to the same Start.
      const alertTypes = proc.active ? proc.alertTypes : trigger!.alertTypes
      const audioArmed = proc.active ? proc.audioArmed : audioTrigger
      const nextEventVars =
        alertTypes.length > 0
          ? { type: alertTypes[0], ...SAMPLE_ALERT_VARS }
          : audioArmed
            ? { ...SAMPLE_AUDIO_VARS, source: 'spotify', isPlaying: true }
            : { ...SAMPLE_ROULETTE_VARS }
      setEventVars(nextEventVars)
      setEventPhase('showing')
      if (proc.active) {
        // Condition nodes (see evaluateCondition in sceneUtils/graph.ts)
        // only ever have real {user}/{amount}/{message}/{source} vars to
        // branch on when the process is armed by an Event — audio/roulette-
        // armed sample vars don't carry that shape, so every Condition just
        // falls to Else during THOSE previews, same as the real overlay
        // would with no matching alert.
        const built = buildProcessSchedule(nodes, edges, alertTypes.length > 0 ? nextEventVars : null)
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

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'error'>('idle')

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

  return { playToken, eventPhase, eventVars, processClockMs, testStatus, handlePlay, handleTest }
}
