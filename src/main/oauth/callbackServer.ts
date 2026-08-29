import { createServer, type Server } from 'node:http'

interface WaitForRedirectOptions {
  port: number
  /** Path the provider redirects back to, e.g. "/callback/spotify". */
  path: string
  /**
   * Implicit-grant tokens arrive in the URL fragment (#access_token=...),
   * which browsers never send to the server. When set, the initial request
   * is answered with a tiny page whose JS reads location.hash and forwards
   * it to `${path}/complete` as a normal query string, which we can read.
   */
  captureFragment?: boolean
  timeoutMs?: number
}

const successPage = (message: string): string => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8" /><title>OBScure</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#eee">
<p>${message}</p>
</body></html>`

const fragmentForwardPage = (): string => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8" /></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#111;color:#eee">
<p>Завершаю авторизацию...</p>
<script>
  var params = new URLSearchParams(location.hash.slice(1));
  var completeUrl = location.pathname.replace(/\\/$/, '') + '/complete?' + params.toString();
  fetch(completeUrl).then(function () {
    document.body.innerHTML = '<p>Готово! Можно закрыть это окно.</p>';
  });
</script>
</body></html>`

/** Spins up a one-shot loopback HTTP server and resolves with the params an OAuth provider redirected back with. */
export function waitForRedirect(options: WaitForRedirectOptions): Promise<URLSearchParams> {
  const { port, path, captureFragment = false, timeoutMs = 120_000 } = options
  const normalizedPath = path.replace(/\/$/, '')
  const completePath = `${normalizedPath}/complete`

  return new Promise((resolvePromise, rejectPromise) => {
    let server: Server | null = null
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      server?.close()
      rejectPromise(new Error('Время ожидания авторизации истекло'))
    }, timeoutMs)

    const finish = (params: URLSearchParams): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(params)
      setTimeout(() => server?.close(), 500)
    }

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)

      if (captureFragment && url.pathname === normalizedPath) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(fragmentForwardPage())
        return
      }

      if (url.pathname === (captureFragment ? completePath : normalizedPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(successPage('Готово! Можно закрыть это окно.'))
        finish(url.searchParams)
        return
      }

      res.writeHead(404)
      res.end()
    })

    server.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectPromise(error)
    })

    server.listen(port, '127.0.0.1')
  })
}
