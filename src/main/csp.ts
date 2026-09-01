const SAFE_HOST_PATTERN = /^[a-zA-Z0-9.-]+$/;

export function buildAppShellCsp(
  overlayHost: string,
  overlayPort: number,
): string {
  const localSources = ["'self'", "http://127.0.0.1:*", "http://localhost:*"];

  const port =
    Number.isInteger(overlayPort) && overlayPort > 0 && overlayPort <= 65535
      ? overlayPort
      : null;
  if (SAFE_HOST_PATTERN.test(overlayHost) && port) {
    localSources.push(`http://${overlayHost}:${port}`);
  }

  return [
    "default-src 'self'",

    `script-src ${localSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",

    // http:/https: (not just localSources) so an Image/Video node's own URL
    // field — which explicitly invites any external link — actually loads
    // in the editor's scene preview instead of silently rendering blank.
    `img-src ${localSources.join(" ")} data: http: https:`,
    // VideoView.tsx renders <video src>, which CSP governs via media-src,
    // not img-src — without this an external video URL still fell back to
    // default-src 'self' and stayed CSP-blocked in the editor preview even
    // after the img-src fix above (it only ever fixed <img>).
    `media-src ${localSources.join(" ")} http: https:`,
    `frame-src ${localSources.join(" ")}`,
  ].join("; ");
}
