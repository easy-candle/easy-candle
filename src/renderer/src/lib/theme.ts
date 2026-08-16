export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'easy-candle:theme'

export type ChartPalette = {
  background: string
  text: string
  grid: string
  scaleBorder: string
  watermark: string
  handleFill: string
  hintFill: string
  hintStroke: string
  hintText: string
}

export const CHART_PALETTES: Record<Theme, ChartPalette> = {
  dark: {
    background: '#09090b',
    text: '#a1a1aa',
    grid: '#27272a',
    scaleBorder: '#3f3f46',
    watermark: 'rgba(255, 255, 255, 0.05)',
    handleFill: '#0B0E11',
    hintFill: '#1a1d24',
    hintStroke: '#3f4654',
    hintText: '#e5e7eb'
  },
  light: {
    background: '#fafafa',
    text: '#52525b',
    grid: '#e4e4e7',
    scaleBorder: '#d4d4d8',
    watermark: 'rgba(0, 0, 0, 0.06)',
    handleFill: '#ffffff',
    hintFill: '#f4f4f5',
    hintStroke: '#d4d4d8',
    hintText: '#3f3f46'
  }
}

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

export function getStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (isTheme(raw)) return raw
  } catch {
    // ignore quota / private mode / missing storage
  }
  return 'dark'
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore quota / private mode
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export function toggleTheme(): Theme {
  const next: Theme = getStoredTheme() === 'light' ? 'dark' : 'light'
  persistTheme(next)
  applyTheme(next)
  return next
}
