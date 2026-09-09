import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

// The hidden capture window (see main/audioCapture.ts) loads this SAME
// renderer bundle — same origin, so enumerateDevices() ids match what
// AudioSourceNode.tsx sees — just with this hash instead of the normal app
// shell, so it runs the background-only capture route instead of the full
// Scene Builder UI. Both branches below are dynamic imports (not static
// top-level imports of App/AudioCaptureRoute) so Rollup puts them in
// separate chunks — the hidden capture window only ever needs the tiny
// AudioCaptureRoute chunk, not the full app shell (all pages, the
// @xyflow/react scene editor, every radix-ui component, ...) it has no use
// for but would otherwise still have to parse and run as a second full
// renderer process.
const isAudioCaptureRoute = location.hash === '#/audio-capture'

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

if (isAudioCaptureRoute) {
  void import('./pages/AudioCaptureRoute').then(({ AudioCaptureRoute }) => {
    root.render(
      <React.StrictMode>
        <AudioCaptureRoute />
      </React.StrictMode>
    )
  })
} else {
  void import('./App').then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  })
}
