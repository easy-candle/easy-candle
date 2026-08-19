import wordmarkSvg from '@/assets/easycandle-wordmark.svg?raw'
import type { Theme } from '@/lib/theme'

/** Dark-theme Easy fill baked into easycandle-wordmark.svg. */
const DARK_EASY_FILL = '#F7F7F5'
const LIGHT_EASY_FILL = '#18181B'
const EASY_TSPAN = /(<tspan fill=")#[A-Fa-f0-9]{6}(">Easy<\/tspan>)/

/** Wordmark SVG with Easy recolored so it stays visible on the chart background. */
export function themedWordmarkUrl(theme: Theme): string {
  const fill = theme === 'light' ? LIGHT_EASY_FILL : DARK_EASY_FILL
  const svg = wordmarkSvg.replace(EASY_TSPAN, `$1${fill}$2`)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
