import { useEffect, useRef } from 'react'
import { AUDIO_LEVELS_BAND_COUNT } from '@shared/audioLevels'

interface CaptureHandle {
  stopped: boolean
  cleanup: () => void
}

/** Downsamples an AnalyserNode's own frequencyBinCount-length byte array to AUDIO_LEVELS_BAND_COUNT bands by averaging each contiguous group — the fixed-resolution mirror of applyEqualizerLevels' own resampling (overlays/custom-render.js), which goes the OTHER direction: this array back up/down to whatever a particular Equalizer's own `barCount` is. */
function downsample(data: Uint8Array): number[] {
  const bands: number[] = []
  const groupSize = data.length / AUDIO_LEVELS_BAND_COUNT
  for (let i = 0; i < AUDIO_LEVELS_BAND_COUNT; i++) {
    const start = Math.floor(i * groupSize)
    const end = Math.max(start + 1, Math.floor((i + 1) * groupSize))
    let sum = 0
    for (let j = start; j < end; j++) sum += data[j]
    bands.push(Math.round(sum / (end - start)))
  }
  return bands
}

/** Opens one device's real capture stream and starts reporting its levels — `handle.stopped` lets a sync that arrives while getUserMedia is still pending cancel cleanly instead of leaving an orphaned stream open. */
async function startCapture(deviceId: string, handle: CaptureHandle): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } })
    if (handle.stopped) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.6
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    let rafId = 0
    let lastSentAt = 0
    const tick = (now: number): void => {
      if (handle.stopped) return
      // Throttled to ~30fps — requestAnimationFrame itself can run faster
      // than that on a high-refresh display, and nothing downstream
      // (updateEqualizerBars' own CSS transition) benefits from more.
      if (now - lastSentAt >= 33) {
        lastSentAt = now
        analyser.getByteFrequencyData(data)
        window.obscure.reportAudioLevels(deviceId, downsample(data))
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    handle.cleanup = () => {
      cancelAnimationFrame(rafId)
      stream.getTracks().forEach((track) => track.stop())
      void audioContext.close()
    }
  } catch {
    // Device unplugged, permission revoked mid-run, or a stale deviceId
    // from a since-removed device — give up silently; the matching
    // Equalizer(s) just stay at their idle/flat state, same as an Audio
    // Source with nothing wired in at all.
  }
}

/**
 * Runs in a hidden, permanently-alive BrowserWindow (see
 * main/audioCapture.ts), never the visible Scene Builder editor — which can
 * be destroyed at any time (minimized to tray, see createMainWindow's own
 * "minimize" handler in main/index.ts) while the overlay server and an OBS
 * Browser Source keep right on running. Owns every currently-open capture
 * stream, one per device an Audio Source node anywhere actually references
 * (see syncAudioCaptureDevices in main/audioCapture.ts), reporting each
 * one's band levels back to the main process over `window.obscure.
 * reportAudioLevels`, which forwards them into OverlayServer.pushAudioLevels
 * for broadcast to any open OBS Browser Source. Renders nothing — this is
 * pure background work, the window itself is never shown.
 */
export function AudioCaptureRoute(): null {
  const handlesRef = useRef<Record<string, CaptureHandle>>({})

  useEffect(() => {
    return window.obscure.onSetAudioCaptureDevices((deviceIds) => {
      const handles = handlesRef.current
      for (const id of Object.keys(handles)) {
        if (deviceIds.includes(id)) continue
        handles[id].stopped = true
        handles[id].cleanup()
        delete handles[id]
      }
      for (const id of deviceIds) {
        if (handles[id]) continue
        const handle: CaptureHandle = { stopped: false, cleanup: () => {} }
        handles[id] = handle
        void startCapture(id, handle)
      }
    })
  }, [])

  return null
}
