/**
 * Any color field in this app (Box's background/border, Text's color,
 * Shadow's color, ...) can hold either a plain `#rrggbb` OR a
 * `linear-gradient(...)` CSS string produced by ColorPicker's Gradient tab —
 * consumers that can pass the value straight into a CSS `background` need no
 * changes at all, everything else (border-color, text color, filter
 * drop-shadow) needs to detect which one it has and switch technique. Mirrors
 * the JS versions of these in overlays/custom.html (isGradientColor,
 * gradientStopColors, backgroundLayer).
 */

export interface GradientStop {
  color: string
  /** 0-100. */
  position: number
}

export interface GradientValue {
  /** CSS gradient angle in degrees (0 = to top, 90 = to right, clockwise). */
  angle: number
  stops: GradientStop[]
}

export function isGradientColor(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().startsWith('linear-gradient(')
}

/**
 * Only ever needs to round-trip strings this app's own ColorPicker produced
 * (buildGradient below) — hex stop colors, an optional leading `<n>deg`, each
 * stop's position always given as a `<n>%` — so this doesn't attempt to
 * handle arbitrary hand-authored gradient syntax (keywords like `to right`,
 * unitless/multi-value stops, rgb()/hsl() colors with their own internal
 * commas, ...).
 */
export function parseGradient(value: string): GradientValue | null {
  const match = /^linear-gradient\(([\s\S]*)\)$/.exec(value.trim())
  if (!match) return null
  const parts = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return null

  let angle = 90
  let rest = parts
  if (/^-?\d+(\.\d+)?deg$/.test(parts[0])) {
    angle = parseFloat(parts[0])
    rest = parts.slice(1)
  }
  if (rest.length === 0) return null

  const stops: GradientStop[] = rest.map((part, i) => {
    const [color, posToken] = part.split(/\s+/)
    const parsedPosition = posToken && posToken.endsWith('%') ? parseFloat(posToken) : NaN
    const position = Number.isFinite(parsedPosition) ? parsedPosition : rest.length > 1 ? (i / (rest.length - 1)) * 100 : 0
    return { color, position }
  })
  return { angle, stops }
}

/**
 * Stops are written out in array order, NOT sorted by position — a stop
 * dragged past its neighbor keeps its own index (what ColorPicker's
 * GradientEditor tracks "selected" by) instead of jumping around every time
 * the string round-trips through parseGradient. A non-monotonic stop order
 * is valid CSS (a browser just clamps a stop's rendered position forward to
 * the largest position seen so far), so this costs nothing but a rare visual
 * seam if someone deliberately drags one stop past another.
 */
export function buildGradient(angle: number, stops: GradientStop[]): string {
  const safeStops = stops.length > 0 ? stops : [{ color: '#ffffff', position: 0 }, { color: '#000000', position: 100 }]
  const normalizedAngle = ((Math.round(angle) % 360) + 360) % 360
  const stopStr = safeStops.map((s) => `${s.color} ${Math.round(Math.min(100, Math.max(0, s.position)))}%`).join(', ')
  return `linear-gradient(${normalizedAngle}deg, ${stopStr})`
}

/** Just the colors, in stop order — for consumers that can't use the gradient itself (e.g. Shadow's filter: drop-shadow(), stacked once per stop as a cheap multi-color glow approximation). */
export function gradientStopColors(value: string): string[] {
  return parseGradient(value)?.stops.map((s) => s.color) ?? []
}

/** A solid or gradient color value as one `background` layer, always as a `background-image` (never `background-color`) — needed because the `background` shorthand only allows a plain color in its LAST comma-separated layer, and the border-gradient trick (borderBoxStyle in sceneUtils/style.ts) needs the fill as a non-last layer. A solid color becomes a flat 2-stop gradient of itself. */
export function backgroundLayer(value: string, box: 'padding-box' | 'border-box'): string {
  const image = isGradientColor(value) ? value : `linear-gradient(${value}, ${value})`
  return `${image} ${box}`
}
