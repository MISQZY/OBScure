/**
 * Any color field in this app (Box's background/border, Text's color,
 * Shadow's color, ...) can hold either a plain `#rrggbb` OR a
 * `linear-gradient(...)`/`radial-gradient(...)` CSS string produced by
 * ColorPicker's Gradient tab — consumers that can pass the value straight
 * into a CSS `background` need no changes at all, everything else
 * (border-color, text color, filter drop-shadow) needs to detect which one
 * it has and switch technique. Mirrors the JS versions of these in
 * overlays/custom-style.js (isGradientColor, gradientStopColors,
 * backgroundLayer) — that mirror only ever needs isGradientColor/
 * gradientStopColors/backgroundLayer (render-time), never parseGradient/
 * buildGradient (editor-time only, so TS-only is fine).
 */

export interface GradientStop {
  color: string
  /**
   * 0-100. For a linear gradient this is a LOGICAL position — a fraction of
   * the way from `start` to `end` (see GradientValue), not the raw CSS
   * percentage buildGradient ultimately writes (those two only coincide
   * when start/end sit exactly on the object's edges). For a radial
   * gradient it IS the raw CSS percentage (0% at `center`, 100% at `edge`),
   * since CSS radial-gradient stop percentages already mean exactly that.
   */
  position: number
}

export interface GradientPoint {
  /** 0-100, percent of the object's own box — 0,0 is its top-left corner. */
  x: number
  y: number
}

export type GradientKind = 'linear' | 'radial'

export interface GradientValue {
  type: GradientKind
  /**
   * Linear only — the points (dragged directly on GradientEditor's object
   * preview) that the gradient's 0%/100% logical stops sit at. CSS's own
   * `linear-gradient()` only takes an angle (the line always spans the
   * whole box, corner to corner) — buildGradient derives that angle from
   * `end - start`, then re-derives where along that full-box line `start`
   * and `end` themselves fall (by projection — see unitLineHalfLength's own
   * doc comment) to remap every stop's logical 0-100 into the matching
   * real CSS percentage. Coordinates are treated as a normalized 0-100 box
   * regardless of the object's actual pixel aspect ratio (the same
   * approximation SVG's objectBoundingBox gradients make) — exact for a
   * square object, a close approximation otherwise.
   */
  start: GradientPoint
  end: GradientPoint
  /**
   * Radial only — the ellipse's center and one point on its edge, same
   * 0-100 box-percent space as start/end above. The distance from `center`
   * to `edge` on each axis becomes that axis's CSS radius percentage
   * directly (`radial-gradient(ellipse <rx>% <ry>% at <cx>% <cy>%, ...)`),
   * so unlike linear this needs no stop remapping at all.
   */
  center: GradientPoint
  edge: GradientPoint
  stops: GradientStop[]
}

const DEFAULT_START: GradientPoint = { x: 0, y: 50 }
const DEFAULT_END: GradientPoint = { x: 100, y: 50 }
const DEFAULT_CENTER: GradientPoint = { x: 50, y: 50 }
const DEFAULT_EDGE: GradientPoint = { x: 100, y: 100 }

export function isGradientColor(value: string | null | undefined): value is string {
  const v = typeof value === 'string' ? value.trim() : ''
  return v.startsWith('linear-gradient(') || v.startsWith('radial-gradient(')
}

/** A fresh 2-stop gradient seeded from a solid color — what ColorPicker's Solid -> Gradient toggle switches to. */
export function defaultGradientValue(seedColor: string): GradientValue {
  return {
    type: 'linear',
    start: DEFAULT_START,
    end: DEFAULT_END,
    center: DEFAULT_CENTER,
    edge: DEFAULT_EDGE,
    stops: [
      { color: seedColor || '#ffffff', position: 0 },
      { color: '#000000', position: 100 }
    ]
  }
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n))
}

/**
 * Half-length of the CSS gradient line at a given angle, in a normalized
 * 0-1 box — the standard corner-to-corner formula (`W·|sinθ| + H·|cosθ|`,
 * here with W=H=1). CSS's own linear-gradient line always spans the full
 * box this way; every projection/placement helper below is built on it.
 */
function unitLineHalfLength(angleDeg: number): number {
  const rad = toRad(angleDeg)
  return (Math.abs(Math.sin(rad)) + Math.abs(Math.cos(rad))) / 2
}

/** Unit direction vector for a CSS gradient angle (0deg = up, clockwise). */
function unitDir(angleDeg: number): GradientPoint {
  const rad = toRad(angleDeg)
  return { x: Math.sin(rad), y: -Math.cos(rad) }
}

/** The box point (0-100 percent) at fraction `t` (0 = the line's own CSS 0%, 1 = its 100%) along the full box-spanning gradient line for the given angle. Inverse of projectToT. */
function pointAtT(angleDeg: number, t: number): GradientPoint {
  const dir = unitDir(angleDeg)
  const k = unitLineHalfLength(angleDeg) * (2 * t - 1)
  return { x: (0.5 + dir.x * k) * 100, y: (0.5 + dir.y * k) * 100 }
}

/** Where a box point (0-100 percent) falls as a fraction `t` along the full box-spanning gradient line for the given angle — t=0 at the line's own CSS 0%, t=1 at its 100%. Inverse of pointAtT. */
function projectToT(angleDeg: number, point: GradientPoint): number {
  const dir = unitDir(angleDeg)
  const half = unitLineHalfLength(angleDeg)
  if (half === 0) return 0.5
  const px = point.x / 100 - 0.5
  const py = point.y / 100 - 0.5
  return (px * dir.x + py * dir.y) / (2 * half) + 0.5
}

function angleFromPoints(start: GradientPoint, end: GradientPoint): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return 90
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

function splitParts(inner: string): string[] {
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseStopList(rest: string[]): GradientStop[] {
  return rest.map((part, i) => {
    const [color, posToken] = part.split(/\s+/)
    const parsedPosition = posToken && posToken.endsWith('%') ? parseFloat(posToken) : NaN
    const position = Number.isFinite(parsedPosition) ? parsedPosition : rest.length > 1 ? (i / (rest.length - 1)) * 100 : 0
    return { color, position }
  })
}

function parseLinearInner(inner: string): GradientValue | null {
  const parts = splitParts(inner)
  if (parts.length === 0) return null

  let angle = 90
  let rest = parts
  if (/^-?\d+(\.\d+)?deg$/.test(parts[0])) {
    angle = parseFloat(parts[0])
    rest = parts.slice(1)
  }
  if (rest.length === 0) return null
  const rawStops = parseStopList(rest)

  // Recover the point-based start/end this app's own buildGradient would
  // have produced: the min/max of the raw CSS stop percentages are exactly
  // where its start/end handles projected to (see GradientValue's own doc
  // comment), so re-deriving their box position from the angle and
  // re-expressing every stop as a 0-100 fraction of that [min, max] range
  // round-trips exactly through GradientEditor.
  const positions = rawStops.map((s) => s.position)
  const minPos = Math.min(...positions)
  const maxPos = Math.max(...positions)
  const span = maxPos - minPos
  const stops = rawStops.map((s) => ({ color: s.color, position: span !== 0 ? ((s.position - minPos) / span) * 100 : 0 }))

  return {
    type: 'linear',
    start: pointAtT(angle, minPos / 100),
    end: pointAtT(angle, maxPos / 100),
    center: DEFAULT_CENTER,
    edge: DEFAULT_EDGE,
    stops
  }
}

function parseRadialInner(inner: string): GradientValue | null {
  const parts = splitParts(inner)
  if (parts.length === 0) return null
  const header = /^ellipse\s+([\d.]+)%\s+([\d.]+)%\s+at\s+([\d.]+)%\s+([\d.]+)%$/.exec(parts[0])
  if (!header) return null
  const rest = parts.slice(1)
  if (rest.length === 0) return null

  const rx = parseFloat(header[1])
  const ry = parseFloat(header[2])
  const cx = parseFloat(header[3])
  const cy = parseFloat(header[4])

  return {
    type: 'radial',
    start: DEFAULT_START,
    end: DEFAULT_END,
    center: { x: cx, y: cy },
    edge: { x: cx + rx, y: cy + ry },
    stops: parseStopList(rest)
  }
}

/**
 * Only ever needs to round-trip strings this app's own ColorPicker produced
 * (buildGradient below) — hex stop colors, an optional leading `<n>deg` or
 * `ellipse <rx>% <ry>% at <cx>% <cy>%` header, each stop's position always
 * given as a `<n>%` — so this doesn't attempt to handle arbitrary
 * hand-authored gradient syntax (keywords like `to right`, unitless/
 * multi-value stops, rgb()/hsl() colors with their own internal commas,
 * `circle`/`closest-side` radial sizing, ...).
 */
export function parseGradient(value: string): GradientValue | null {
  const trimmed = value.trim()
  const radial = /^radial-gradient\(([\s\S]*)\)$/.exec(trimmed)
  if (radial) return parseRadialInner(radial[1])
  const linear = /^linear-gradient\(([\s\S]*)\)$/.exec(trimmed)
  if (linear) return parseLinearInner(linear[1])
  return null
}

/**
 * Stops are written out sorted by their real CSS percentage — NOT in array
 * order. CSS clamps a color-stop forward to the largest position any
 * *earlier* stop in the list already had, so with 2 stops (always written
 * start-then-end) array order and sorted order coincide, but `+ Add color`
 * always APPENDS the new stop to the end of the array regardless of where
 * its position falls — with 3+ stops that almost always makes the raw array
 * order non-monotonic, and CSS would silently collapse the misordered stop
 * onto its predecessor instead of rendering it where it was placed. Sorting
 * only here (not on `value.stops` itself) keeps GradientEditor's own
 * "selected" index — a plain index into that array — meaningful while an
 * edit is in progress; it can still point at a different stop right after
 * an edit that reorders the output (a stop dragged past a neighbor, or a
 * newly added one landing before another), same as switching which handle
 * you're mid-drag on — a rare, harmless seam, not a rendering bug.
 */
export function buildGradient(value: GradientValue): string {
  const stops = value.stops.length > 0 ? value.stops : [{ color: '#ffffff', position: 0 }, { color: '#000000', position: 100 }]

  if (value.type === 'radial') {
    const rx = Math.max(1, Math.abs(value.edge.x - value.center.x))
    const ry = Math.max(1, Math.abs(value.edge.y - value.center.y))
    const cssStops = stops
      .map((s) => ({ color: s.color, position: Math.round(clampPct(s.position)) }))
      .sort((a, b) => a.position - b.position)
    const stopStr = cssStops.map((s) => `${s.color} ${s.position}%`).join(', ')
    return `radial-gradient(ellipse ${Math.round(rx)}% ${Math.round(ry)}% at ${Math.round(clampPct(value.center.x))}% ${Math.round(clampPct(value.center.y))}%, ${stopStr})`
  }

  const angle = angleFromPoints(value.start, value.end)
  const tStart = projectToT(angle, value.start) * 100
  const tEnd = projectToT(angle, value.end) * 100
  const cssStops = stops
    .map((s) => ({ color: s.color, position: Math.round(tStart + (clampPct(s.position) / 100) * (tEnd - tStart)) }))
    .sort((a, b) => a.position - b.position)
  const stopStr = cssStops.map((s) => `${s.color} ${s.position}%`).join(', ')
  return `linear-gradient(${Math.round(angle)}deg, ${stopStr})`
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
