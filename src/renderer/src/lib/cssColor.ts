export type Rgba = { r: number; g: number; b: number; a: number }

/** Default rectangle fill opacity: translucent enough to keep candles readable. */
export const DEFAULT_FILL_OPACITY = 0.2

const HEX3 = /^#([0-9a-fA-F]{3})$/
const HEX6 = /^#([0-9a-fA-F]{6})$/
const HEX8 = /^#([0-9a-fA-F]{8})$/
const RGB =
  /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/

export function isCssColor(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return HEX3.test(value) || HEX6.test(value) || HEX8.test(value) || RGB.test(value)
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(255, Math.max(0, Math.round(value)))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}

export function parseColor(value: string): Rgba {
  const rgba = RGB.exec(value)
  if (rgba) {
    return {
      r: clampByte(Number(rgba[1])),
      g: clampByte(Number(rgba[2])),
      b: clampByte(Number(rgba[3])),
      a: rgba[4] == null || rgba[4] === '' ? 1 : clamp01(Number(rgba[4]))
    }
  }
  let hex = value.replace('#', '')
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (hex.length === 8) {
    return {
      r: clampByte(Number.parseInt(hex.slice(0, 2), 16)),
      g: clampByte(Number.parseInt(hex.slice(2, 4), 16)),
      b: clampByte(Number.parseInt(hex.slice(4, 6), 16)),
      a: clamp01(Number.parseInt(hex.slice(6, 8), 16) / 255)
    }
  }
  return {
    r: clampByte(Number.parseInt(hex.slice(0, 2), 16)),
    g: clampByte(Number.parseInt(hex.slice(2, 4), 16)),
    b: clampByte(Number.parseInt(hex.slice(4, 6), 16)),
    a: 1
  }
}

export function toHex({ r, g, b }: Pick<Rgba, 'r' | 'g' | 'b'>): string {
  return `#${[r, g, b].map((n) => clampByte(n).toString(16).padStart(2, '0')).join('')}`
}

export function toColorString({ r, g, b, a }: Rgba): string {
  const hex = toHex({ r, g, b })
  const alpha = Math.round(clamp01(a) * 100) / 100
  if (alpha >= 1) return hex
  return `rgba(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}, ${alpha})`
}

export function sanitizeCssColor(value: unknown, fallback: string): string {
  if (!isCssColor(value)) return fallback
  return toColorString(parseColor(value))
}

/** Keep the current alpha and adopt RGB from a palette/hex pick. */
export function adoptRgb(nextRgb: string, current: string): string {
  return toColorString({ ...parseColor(nextRgb), a: parseColor(current).a })
}

export function withAlpha(color: string, alpha: number): string {
  return toColorString({ ...parseColor(color), a: alpha })
}
