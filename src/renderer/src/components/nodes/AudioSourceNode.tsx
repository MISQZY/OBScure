import React, { useEffect, useState } from 'react'
import { NodeProps, useReactFlow } from '@xyflow/react'
import { Mic, Clapperboard, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

import { useI18n } from '@/providers/I18nProvider'
import { AUDIO_SOURCE_OUTPUTS, AUDIO_SOURCE_SOCKETS } from './constants'
import { BaseNode, Field, NodeSelect, Callout, IconToggleGroup, useHasIncomingEdge, textInputClass } from './utils'

interface AudioDeviceOption {
  deviceId: string
  label: string
}

const SOURCE_KIND_BUTTONS: readonly { id: 'device' | 'obs'; Icon: LucideIcon; title: string }[] = [
  { id: 'device', Icon: Mic, title: 'Microphone/device' },
  { id: 'obs', Icon: Clapperboard, title: 'OBS audio source' }
] as const

/** Windows device labels are often "<short name> - <long driver/description text>" — only the part before the first "-" is worth showing in the node's own tight layout. Falls back to the full label when there's no "-" at all, or when trimming would leave nothing. */
function shortDeviceLabel(label: string): string {
  const idx = label.indexOf('-')
  if (idx === -1) return label
  const short = label.slice(0, idx).trim()
  return short || label
}

/** Device-picker body (sourceKind 'device') — real local capture, unchanged from before OBS mode existed. */
function DevicePicker({ id, data, updateNodeData }: { id: string; data: Record<string, unknown>; updateNodeData: (id: string, data: Record<string, unknown>) => void }) {
  const [devices, setDevices] = useState<AudioDeviceOption[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
        const list = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        setDevices(list.filter((d) => d.kind === 'audioinput').map((d, i) => ({ deviceId: d.deviceId, label: shortDeviceLabel(d.label || `Microphone ${i + 1}`) })))
      } catch {
        if (!cancelled) setError(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const deviceId = (data.deviceId as string) || ''
  const options = devices ?? []

  // Picks a sensible starting device the moment the list first loads for a
  // brand-new node (NODE_DEFAULTS.audioSource starts empty) — same "give it
  // a concrete value instead of an empty-looking default" reasoning
  // NODE_DEFAULTS' own doc comment gives for every other node type.
  useEffect(() => {
    if (deviceId === '' && options.length > 0) {
      updateNodeData(id, { deviceId: options[0].deviceId, deviceLabel: options[0].label })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices])

  const selected = options.find((o) => o.deviceId === deviceId)

  if (error) return <Callout>No microphone access — check the OS's own privacy settings for this app.</Callout>
  if (options.length === 0) return <Callout>{devices == null ? 'Loading devices…' : 'No input devices found.'}</Callout>

  return (
    <>
      <Field label="Device">
        <NodeSelect
          value={deviceId || options[0].deviceId}
          options={options.map((o) => o.deviceId)}
          onChange={(next) => {
            const opt = options.find((o) => o.deviceId === next)
            updateNodeData(id, { deviceId: next, deviceLabel: opt?.label ?? '' })
          }}
          renderOption={(optId) => options.find((o) => o.deviceId === optId)?.label ?? optId}
        />
      </Field>
      {deviceId && selected == null && <Callout>Saved device "{(data.deviceLabel as string) || deviceId}" not found — pick another.</Callout>}
    </>
  )
}

/**
 * OBS-source picker body (sourceKind 'obs') — lists OBS's own current audio
 * inputs (Desktop Audio, Mic/Aux, ...) via the OBS WebSocket integration
 * (see main/integrations/obs). Its levels are SYNTHESIZED from OBS's own
 * peak/magnitude meter, not a real spectrum — see ObsIntegration's own doc
 * comment for why obs-websocket has nothing richer to offer. The resolved
 * `deviceId` this writes (`obs:<name>`) is the exact key ObsIntegration
 * pushes levels under, so buildEqualizer/EqualizerView need no changes to
 * consume either source kind.
 */
function ObsSourcePicker({ id, data, updateNodeData }: { id: string; data: Record<string, unknown>; updateNodeData: (id: string, data: Record<string, unknown>) => void }) {
  const [inputs, setInputs] = useState<string[] | null>(null)

  useEffect(() => {
    let cancelled = false
    window.obscure.getObsAudioInputs().then((list) => {
      if (!cancelled) setInputs(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const obsInputName = (data.obsInputName as string) || ''
  const options = inputs ?? []

  useEffect(() => {
    if (obsInputName === '' && options.length > 0) {
      updateNodeData(id, { obsInputName: options[0], deviceId: `obs:${options[0]}` })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs])

  if (inputs != null && inputs.length === 0) {
    return <Callout>No OBS audio inputs found — check OBS is running and connected (Settings → Integrations → OBS).</Callout>
  }
  if (inputs == null) return <Callout>Loading OBS inputs…</Callout>

  const selected = options.includes(obsInputName)

  return (
    <>
      <Field label="OBS Source">
        <NodeSelect
          value={obsInputName || options[0]}
          options={options}
          onChange={(next) => updateNodeData(id, { obsInputName: next, deviceId: `obs:${next}` })}
        />
      </Field>
      {obsInputName && !selected && <Callout>Saved OBS source "{obsInputName}" not found — pick another.</Callout>}
    </>
  )
}

/**
 * Names the audio input an Equalizer's own Source socket should track (see
 * EQUALIZER_SOCKETS' own doc comment) — this node carries only that choice,
 * never any audio itself. Two independent ways to resolve it (see
 * `sourceKind`):
 * - 'device' (default): a real local capture device, analyzed with a real
 *   AnalyserNode in a hidden window the Electron app itself keeps alive for
 *   as long as it's running (see main/audioCapture.ts) — a genuine
 *   per-frequency spectrum.
 * - 'obs': one of OBS's own audio mixer inputs, read via the OBS WebSocket
 *   integration (main/integrations/obs) — OBS only ever exposes a single
 *   peak/magnitude level per input, so this feed is a SYNTHESIZED
 *   pseudo-spectrum reacting to real loudness rather than a true spectrum
 *   (see ObsIntegration's own doc comment).
 * Either way, the resolved `deviceId` field is the one thing downstream
 * rendering (buildEqualizer/applyEqualizerLevels) actually reads — it's an
 * opaque map key to that code, so it never needs to know which kind
 * produced it.
 *
 * A third, OPTIONAL path bypasses sourceKind entirely: wiring an Audio
 * Player's Content output into this node's own Content socket (see
 * AUDIO_SOURCE_SOCKETS) makes its Equalizer pulse along with playback
 * (isPlaying true/false) instead of any real device/OBS feed — no
 * microphone or OBS connection needed at all, at the cost of it being a
 * generic pulse rather than anything reacting to the actual audio. Once
 * wired, the Source toggle/picker below goes read-only (same "the wire
 * already decided" precedent as ImageNode's own URL field for the same
 * Content wire) since it no longer means anything.
 */
export function AudioSourceNode({ id, data }: NodeProps) {
  const { updateNodeData } = useReactFlow()
  const { t } = useI18n()
  const sourceKind = data.sourceKind === 'obs' ? 'obs' : 'device'
  const contentConnected = useHasIncomingEdge(id, 'content')

  return (
    <BaseNode id={id} data={data} title="Audio Source" category="data" sockets={AUDIO_SOURCE_SOCKETS} outputSockets={AUDIO_SOURCE_OUTPUTS} help={t.sceneBuilder.tooltip.nodes.audioSource}>
      {contentConnected ? (
        <Field label="Device">
          <input type="text" disabled value="Content" className={cn(textInputClass, 'opacity-50')} />
        </Field>
      ) : (
        <>
          <Field label="Source">
            <IconToggleGroup value={sourceKind} options={SOURCE_KIND_BUTTONS} onChange={(next) => updateNodeData(id, { sourceKind: next })} />
          </Field>
          {sourceKind === 'obs' ? <ObsSourcePicker id={id} data={data} updateNodeData={updateNodeData} /> : <DevicePicker id={id} data={data} updateNodeData={updateNodeData} />}
        </>
      )}
    </BaseNode>
  )
}
