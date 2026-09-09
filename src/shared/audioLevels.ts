/**
 * Frequency-band resolution the hidden capture window resamples its own
 * AnalyserNode output down to before reporting (see
 * pages/AudioCaptureRoute.tsx) — fixed regardless of any particular
 * Equalizer node's own `barCount`, which instead resamples THIS array
 * up/down as needed at render time (see applyEqualizerLevels in
 * overlays/custom-render.js). Plain shared constant (no Electron import) so
 * both the main process (main/audioCapture.ts) and the renderer's capture
 * route can import it without pulling main-process-only modules into the
 * renderer bundle.
 */
export const AUDIO_LEVELS_BAND_COUNT = 32
