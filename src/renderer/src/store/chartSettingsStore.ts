import { create } from 'zustand'
import { CrosshairMode, LineStyle, PriceScaleMode, type LineWidth } from 'lightweight-charts'
import { CHART_PALETTES, type ChartPalette, type Theme } from '@/lib/theme'

const STORAGE_KEY = 'easy-candle:chart-settings'

/** Series / crosshair colors not present in the theme palette. */
export const SERIES_DEFAULT_COLORS = {
  upColor: '#22c55e',
  downColor: '#ef4444',
  wickUpColor: '#22c55e',
  wickDownColor: '#ef4444',
  lineColor: '#22c55e',
  borderUpColor: '#16a34a',
  borderDownColor: '#dc2626'
}

/** Colors the user has explicitly overridden (theme still drives the rest). */
export type ColorOverrides = Partial<typeof SERIES_DEFAULT_COLORS> &
  Partial<Pick<ChartPalette, 'background' | 'text' | 'grid' | 'scaleBorder' | 'watermark'>> & {
    crosshairColor?: string
  }

export type CrosshairSettings = {
  mode: CrosshairMode
  lineStyle: LineStyle
  lineWidth: LineWidth
  visible: boolean
  labelVisible: boolean
}

export type PriceScaleSettings = {
  mode: PriceScaleMode
  invertScale: boolean
  autoScale: boolean
}

export type TimeScaleSettings = {
  timeVisible: boolean
  secondsVisible: boolean
}

export const DEFAULT_CROSSHAIR: CrosshairSettings = {
  mode: CrosshairMode.Normal,
  lineStyle: LineStyle.LargeDashed,
  lineWidth: 1,
  visible: true,
  labelVisible: true
}

export const DEFAULT_PRICE_SCALE: PriceScaleSettings = {
  mode: PriceScaleMode.Normal,
  invertScale: false,
  autoScale: true
}

export const DEFAULT_TIME_SCALE: TimeScaleSettings = {
  timeVisible: true,
  secondsVisible: false
}

type ChartSettingsState = {
  colors: ColorOverrides
  crosshair: CrosshairSettings
  priceScale: PriceScaleSettings
  timeScale: TimeScaleSettings
  setColors: (patch: ColorOverrides) => void
  setCrosshair: (patch: Partial<CrosshairSettings>) => void
  setPriceScale: (patch: Partial<PriceScaleSettings>) => void
  setTimeScale: (patch: Partial<TimeScaleSettings>) => void
  toggleInvertScale: () => void
  resetAll: () => void
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value)
}

function isRgbaColor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)$/.test(value)
  )
}

function isValidColor(value: unknown): value is string {
  return isHexColor(value) || isRgbaColor(value)
}

function isLineWidth(value: unknown): value is LineWidth {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function isCrosshairMode(value: unknown): value is CrosshairMode {
  return Object.values(CrosshairMode).includes(value as CrosshairMode)
}

function isLineStyle(value: unknown): value is LineStyle {
  return Object.values(LineStyle).includes(value as LineStyle)
}

function isPriceScaleMode(value: unknown): value is PriceScaleMode {
  return Object.values(PriceScaleMode).includes(value as PriceScaleMode)
}

function sanitizeColors(raw: unknown): ColorOverrides {
  if (!raw || typeof raw !== 'object') return {}
  const source = raw as Record<string, unknown>
  const out: ColorOverrides = {}
  const paletteKeys: (keyof ChartPalette)[] = [
    'background',
    'text',
    'grid',
    'scaleBorder',
    'watermark'
  ]
  const seriesKeys = Object.keys(SERIES_DEFAULT_COLORS) as (keyof typeof SERIES_DEFAULT_COLORS)[]
  for (const key of [...seriesKeys, 'crosshairColor']) {
    if (isValidColor(source[key])) out[key] = source[key]
  }
  for (const key of paletteKeys) {
    if (isValidColor(source[key])) out[key] = source[key]
  }
  return out
}

function loadPersisted(): Pick<
  ChartSettingsState,
  'colors' | 'crosshair' | 'priceScale' | 'timeScale'
> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return {
        colors: {},
        crosshair: DEFAULT_CROSSHAIR,
        priceScale: DEFAULT_PRICE_SCALE,
        timeScale: DEFAULT_TIME_SCALE
      }
    const parsed = JSON.parse(raw) as {
      colors?: unknown
      crosshair?: Partial<CrosshairSettings>
      priceScale?: Partial<PriceScaleSettings>
      timeScale?: Partial<TimeScaleSettings>
    }
    if (!parsed || typeof parsed !== 'object') {
      return {
        colors: {},
        crosshair: DEFAULT_CROSSHAIR,
        priceScale: DEFAULT_PRICE_SCALE,
        timeScale: DEFAULT_TIME_SCALE
      }
    }
    return {
      colors: sanitizeColors(parsed.colors),
      crosshair: {
        ...DEFAULT_CROSSHAIR,
        ...(parsed.crosshair && typeof parsed.crosshair === 'object' ? parsed.crosshair : {}),
        mode: isCrosshairMode(parsed.crosshair?.mode)
          ? parsed.crosshair.mode
          : DEFAULT_CROSSHAIR.mode,
        lineStyle: isLineStyle(parsed.crosshair?.lineStyle)
          ? parsed.crosshair.lineStyle
          : DEFAULT_CROSSHAIR.lineStyle,
        lineWidth: isLineWidth(parsed.crosshair?.lineWidth)
          ? parsed.crosshair.lineWidth
          : DEFAULT_CROSSHAIR.lineWidth,
        visible:
          typeof parsed.crosshair?.visible === 'boolean'
            ? parsed.crosshair.visible
            : DEFAULT_CROSSHAIR.visible,
        labelVisible:
          typeof parsed.crosshair?.labelVisible === 'boolean'
            ? parsed.crosshair.labelVisible
            : DEFAULT_CROSSHAIR.labelVisible
      },
      priceScale: {
        ...DEFAULT_PRICE_SCALE,
        ...(parsed.priceScale && typeof parsed.priceScale === 'object' ? parsed.priceScale : {}),
        mode: isPriceScaleMode(parsed.priceScale?.mode)
          ? parsed.priceScale.mode
          : DEFAULT_PRICE_SCALE.mode,
        invertScale:
          typeof parsed.priceScale?.invertScale === 'boolean'
            ? parsed.priceScale.invertScale
            : DEFAULT_PRICE_SCALE.invertScale,
        autoScale:
          typeof parsed.priceScale?.autoScale === 'boolean'
            ? parsed.priceScale.autoScale
            : DEFAULT_PRICE_SCALE.autoScale
      },
      timeScale: {
        ...DEFAULT_TIME_SCALE,
        ...(parsed.timeScale && typeof parsed.timeScale === 'object' ? parsed.timeScale : {}),
        timeVisible:
          typeof parsed.timeScale?.timeVisible === 'boolean'
            ? parsed.timeScale.timeVisible
            : DEFAULT_TIME_SCALE.timeVisible,
        secondsVisible:
          typeof parsed.timeScale?.secondsVisible === 'boolean'
            ? parsed.timeScale.secondsVisible
            : DEFAULT_TIME_SCALE.secondsVisible
      }
    }
  } catch {
    return {
      colors: {},
      crosshair: DEFAULT_CROSSHAIR,
      priceScale: DEFAULT_PRICE_SCALE,
      timeScale: DEFAULT_TIME_SCALE
    }
  }
}

function persist(
  partial: Pick<ChartSettingsState, 'colors' | 'crosshair' | 'priceScale' | 'timeScale'>
): void {
  try {
    const current = loadPersisted()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...partial }))
  } catch {
    // ignore quota / private mode
  }
}

const initial = loadPersisted()

export const useChartSettingsStore = create<ChartSettingsState>((set, get) => ({
  colors: initial.colors,
  crosshair: initial.crosshair,
  priceScale: initial.priceScale,
  timeScale: initial.timeScale,

  setColors: (patch) => {
    const colors = { ...get().colors, ...patch }
    set({ colors })
    persist({
      colors,
      crosshair: get().crosshair,
      priceScale: get().priceScale,
      timeScale: get().timeScale
    })
  },

  setCrosshair: (patch) => {
    const crosshair = { ...get().crosshair, ...patch }
    set({ crosshair })
    persist({
      colors: get().colors,
      crosshair,
      priceScale: get().priceScale,
      timeScale: get().timeScale
    })
  },

  setPriceScale: (patch) => {
    const priceScale = { ...get().priceScale, ...patch }
    set({ priceScale })
    persist({
      colors: get().colors,
      crosshair: get().crosshair,
      priceScale,
      timeScale: get().timeScale
    })
  },

  setTimeScale: (patch) => {
    const timeScale = { ...get().timeScale, ...patch }
    set({ timeScale })
    persist({
      colors: get().colors,
      crosshair: get().crosshair,
      priceScale: get().priceScale,
      timeScale
    })
  },

  toggleInvertScale: () => {
    get().setPriceScale({ invertScale: !get().priceScale.invertScale })
  },

  resetAll: () => {
    set({
      colors: {},
      crosshair: DEFAULT_CROSSHAIR,
      priceScale: DEFAULT_PRICE_SCALE,
      timeScale: DEFAULT_TIME_SCALE
    })
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore quota / private mode
    }
  }
}))

/** Full chart palette: theme defaults merged with the user's color overrides. */
export function resolveChartPalette(
  theme: Theme,
  overrides: ColorOverrides = useChartSettingsStore.getState().colors
): ChartPalette & typeof SERIES_DEFAULT_COLORS & { crosshairColor: string } {
  const base = CHART_PALETTES[theme]
  return {
    ...SERIES_DEFAULT_COLORS,
    crosshairColor: base.scaleBorder,
    ...base,
    ...overrides
  }
}
