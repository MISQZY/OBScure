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

    `img-src ${localSources.join(" ")} data:`,
    `frame-src ${localSources.join(" ")}`,
  ].join("; ");
}
