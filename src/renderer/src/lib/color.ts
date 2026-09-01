/**
 * Converts a CSS color string to a `#rrggbb` hex string, for consumers that
 * can't use CSS directly — namely the native `titleBarOverlay` (see
 * deriveTitleBarOverlay below), which Electron/DWM requires as hex.
 * Returns null for anything it can't parse (rgb()/hsl()/named colors aren't
 * used anywhere in this app's palettes, so they're left unsupported rather
 * than pulling in a full color library).
 */
export function cssColorToHex(value: string): string | null {
  const trimmed = value.trim()

  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(trimmed)
  if (hexMatch) {
    const hex = hexMatch[1]
    if (hex.length === 3) {
      const [r, g, b] = hex
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
    }
    return `#${hex}`.toLowerCase()
  }

  const oklchMatch = /^oklch\(\s*([\d.]+)(%)?\s+([\d.]+)(%)?\s+([\d.]+)(?:deg)?\s*(?:\/[^)]+)?\)$/i.exec(trimmed)
  if (oklchMatch) {
    const [, lRaw, lPct, cRaw, cPct, hRaw] = oklchMatch
    const l = lPct ? Number(lRaw) / 100 : Number(lRaw)
    const c = cPct ? (Number(cRaw) / 100) * 0.4 : Number(cRaw)
    const h = Number(hRaw)
    return oklchToHex(l, c, h)
  }

  return null
}

function linearToSrgbChannel(linear: number): number {
  const abs = Math.abs(linear)
  const srgb = abs > 0.0031308 ? 1.055 * abs ** (1 / 2.4) - 0.055 : linear * 12.92
  return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
}

/** OKLCH -> sRGB, via OKLab -> LMS -> linear sRGB. Coefficients from Björn Ottosson's OKLab reference implementation. */
function oklchToHex(l: number, c: number, hDeg: number): string {
  const hRad = (hDeg * Math.PI) / 180
  const a = c * Math.cos(hRad)
  const b = c * Math.sin(hRad)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b
  const l3 = l_ ** 3
  const m3 = m_ ** 3
  const s3 = s_ ** 3

  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3

  const toByte = (n: number): string => linearToSrgbChannel(n).toString(16).padStart(2, '0')
  return `#${toByte(r)}${toByte(g)}${toByte(bl)}`
}

export interface TitleBarOverlayColors {
  color: string
  symbolColor: string
}

/**
 * Derives the native titlebar's button colors from a theme's actual CSS
 * palette (--sidebar for the background, --muted-foreground for the icon)
 * instead of trusting a hand-authored hex duplicate — which is what let a
 * custom theme's caption buttons drift out of sync with its real colors
 * whenever someone edited `colors` (oklch) without also updating a separate
 * `titleBarOverlay` (hex) block. Falls back to `fallback` for any channel
 * this can't parse (e.g. rgb()/hsl()/named colors).
 */
export function deriveTitleBarOverlay(
  colors: Record<string, string>,
  fallback: TitleBarOverlayColors
): TitleBarOverlayColors {
  const color = (colors['--sidebar'] && cssColorToHex(colors['--sidebar'])) ?? fallback.color
  const symbolColor = (colors['--muted-foreground'] && cssColorToHex(colors['--muted-foreground'])) ?? fallback.symbolColor
  return { color, symbolColor }
}
