import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AudioCaptureRoute } from './pages/AudioCaptureRoute'
import './index.css'

// The hidden capture window (see main/audioCapture.ts) loads this SAME
// renderer bundle — same origin, so enumerateDevices() ids match what
// AudioSourceNode.tsx sees — just with this hash instead of the normal app
// shell, so it runs the background-only capture route instead of the full
// Scene Builder UI.
const isAudioCaptureRoute = location.hash === '#/audio-capture'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isAudioCaptureRoute ? <AudioCaptureRoute /> : <App />}</React.StrictMode>
)
