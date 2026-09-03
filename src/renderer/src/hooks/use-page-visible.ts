import * as React from "react"

/**
 * Tracks the Page Visibility API — false while the window is hidden (e.g.
 * minimized to tray, see window:minimizeToTray). Electron reflects the
 * BrowserWindow's own show/hide state onto this automatically, so a
 * tray-minimized main window flips this to false with no IPC round trip.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = React.useState(() => document.visibilityState === "visible")

  React.useEffect(() => {
    const onChange = (): void => setVisible(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", onChange)
    return () => document.removeEventListener("visibilitychange", onChange)
  }, [])

  return visible
}
