import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    server: {
      // Bind explicitly to IPv4 loopback: on Windows Vite's default "localhost"
      // host can end up bound only to ::1 while Electron's initial loadURL
      // resolves "localhost" to 127.0.0.1, causing a connection-refused race.
      host: '127.0.0.1',
      // Without this, a stale dev server left over from a previous `npm run dev`
      // (electron-vite's restart-on-main-change doesn't always fully kill it)
      // makes Vite silently fall back to the next free port. The renderer then
      // loads from a different origin each time, which resets anything kept in
      // localStorage (onboarding tour progress, theme choice — see TourProvider.tsx
      // and index.ts's ELECTRON_RENDERER_URL comment) even though nothing was
      // actually lost. Failing loudly here surfaces the leaked process instead.
      strictPort: true
    },
    plugins: [react(), tailwindcss()]
  }
})
