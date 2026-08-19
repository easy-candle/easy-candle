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

export const PRESET_NAME_MAX_LENGTH = 48

export type ChartSettingsSnapshot = {
  colors: ColorOverrides
  crosshair: CrosshairSettings
  priceScale: PriceScaleSettings
  timeScale: TimeScaleSettings
}

export type ChartSettingsPreset = ChartSettingsSnapshot & {
  id: string
  name: string
  savedAt: number
}

type PersistedChartSettings = ChartSettingsSnapshot & {
  presets: ChartSettingsPreset[]
}

type ChartSettingsState = PersistedChartSettings & {
  setColors: (patch: ColorOverrides) => void
  setCrosshair: (patch: Partial<CrosshairSettings>) => void
  setPriceScale: (patch: Partial<PriceScaleSettings>) => void
  setTimeScale: (patch: Partial<TimeScaleSettings>) => void
  toggleInvertScale: () => void
  savePreset: (name: string) => boolean
  restorePreset: (id: string) => boolean
  deletePreset: (id: string) => void
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

function sanitizeCrosshair(raw: unknown): CrosshairSettings {
  const source = raw && typeof raw === 'object' ? (raw as Partial<CrosshairSettings>) : {}
  return {
    ...DEFAULT_CROSSHAIR,
    ...source,
    mode: isCrosshairMode(source.mode) ? source.mode : DEFAULT_CROSSHAIR.mode,
    lineStyle: isLineStyle(source.lineStyle) ? source.lineStyle : DEFAULT_CROSSHAIR.lineStyle,
    lineWidth: isLineWidth(source.lineWidth) ? source.lineWidth : DEFAULT_CROSSHAIR.lineWidth,
    visible: typeof source.visible === 'boolean' ? source.visible : DEFAULT_CROSSHAIR.visible,
    labelVisible:
      typeof source.labelVisible === 'boolean'
        ? source.labelVisible
        : DEFAULT_CROSSHAIR.labelVisible
  }
}

function sanitizePriceScale(raw: unknown): PriceScaleSettings {
  const source = raw && typeof raw === 'object' ? (raw as Partial<PriceScaleSettings>) : {}
  return {
    ...DEFAULT_PRICE_SCALE,
    ...source,
    mode: isPriceScaleMode(source.mode) ? source.mode : DEFAULT_PRICE_SCALE.mode,
    invertScale:
      typeof source.invertScale === 'boolean'
        ? source.invertScale
        : DEFAULT_PRICE_SCALE.invertScale,
    autoScale:
      typeof source.autoScale === 'boolean' ? source.autoScale : DEFAULT_PRICE_SCALE.autoScale
  }
}

function sanitizeTimeScale(raw: unknown): TimeScaleSettings {
  const source = raw && typeof raw === 'object' ? (raw as Partial<TimeScaleSettings>) : {}
  return {
    ...DEFAULT_TIME_SCALE,
    ...source,
    timeVisible:
      typeof source.timeVisible === 'boolean' ? source.timeVisible : DEFAULT_TIME_SCALE.timeVisible,
    secondsVisible:
      typeof source.secondsVisible === 'boolean'
        ? source.secondsVisible
        : DEFAULT_TIME_SCALE.secondsVisible
  }
}

function sanitizeSnapshot(raw: unknown): ChartSettingsSnapshot {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    colors: sanitizeColors(source.colors),
    crosshair: sanitizeCrosshair(source.crosshair),
    priceScale: sanitizePriceScale(source.priceScale),
    timeScale: sanitizeTimeScale(source.timeScale)
  }
}

function cloneSnapshot(snapshot: ChartSettingsSnapshot): ChartSettingsSnapshot {
  return {
    colors: { ...snapshot.colors },
    crosshair: { ...snapshot.crosshair },
    priceScale: { ...snapshot.priceScale },
    timeScale: { ...snapshot.timeScale }
  }
}

function sanitizePresets(raw: unknown): ChartSettingsPreset[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: ChartSettingsPreset[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const name =
      typeof rec.name === 'string' ? rec.name.trim().slice(0, PRESET_NAME_MAX_LENGTH) : ''
    if (!name) continue
    const id = typeof rec.id === 'string' && rec.id.length > 0 ? rec.id : crypto.randomUUID()
    if (seen.has(id)) continue
    seen.add(id)
    const savedAt =
      typeof rec.savedAt === 'number' && Number.isFinite(rec.savedAt) ? rec.savedAt : Date.now()
    out.push({
      id,
      name,
      savedAt,
      ...sanitizeSnapshot(rec)
    })
  }
  return out
}

const EMPTY_SETTINGS: PersistedChartSettings = {
  colors: {},
  crosshair: DEFAULT_CROSSHAIR,
  priceScale: DEFAULT_PRICE_SCALE,
  timeScale: DEFAULT_TIME_SCALE,
  presets: []
}

function loadPersisted(): PersistedChartSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_SETTINGS
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return EMPTY_SETTINGS
    const rec = parsed as Record<string, unknown>
    return {
      ...sanitizeSnapshot(rec),
      presets: sanitizePresets(rec.presets)
    }
  } catch {
    return EMPTY_SETTINGS
  }
}

function persist(partial: Partial<PersistedChartSettings>): void {
  try {
    const current = loadPersisted()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...partial }))
  } catch {
    // ignore quota / private mode
  }
}

function persistLive(get: () => ChartSettingsState): void {
  persist({
    colors: get().colors,
    crosshair: get().crosshair,
    priceScale: get().priceScale,
    timeScale: get().timeScale,
    presets: get().presets
  })
}

const initial = loadPersisted()

export const useChartSettingsStore = create<ChartSettingsState>((set, get) => ({
  colors: initial.colors,
  crosshair: initial.crosshair,
  priceScale: initial.priceScale,
  timeScale: initial.timeScale,
  presets: initial.presets,

  setColors: (patch) => {
    const colors = { ...get().colors, ...patch }
    set({ colors })
    persistLive(get)
  },

  setCrosshair: (patch) => {
    const crosshair = { ...get().crosshair, ...patch }
    set({ crosshair })
    persistLive(get)
  },

  setPriceScale: (patch) => {
    const priceScale = { ...get().priceScale, ...patch }
    set({ priceScale })
    persistLive(get)
  },

  setTimeScale: (patch) => {
    const timeScale = { ...get().timeScale, ...patch }
    set({ timeScale })
    persistLive(get)
  },

  toggleInvertScale: () => {
    get().setPriceScale({ invertScale: !get().priceScale.invertScale })
  },

  savePreset: (name) => {
    const trimmed = name.trim().slice(0, PRESET_NAME_MAX_LENGTH)
    if (!trimmed) return false
    const snapshot = cloneSnapshot(get())
    const existing = get().presets.find(
      (preset) => preset.name.toLowerCase() === trimmed.toLowerCase()
    )
    const nextPreset: ChartSettingsPreset = {
      id: existing?.id ?? crypto.randomUUID(),
      name: trimmed,
      savedAt: Date.now(),
      ...snapshot
    }
    const presets = existing
      ? get().presets.map((preset) => (preset.id === existing.id ? nextPreset : preset))
      : [...get().presets, nextPreset]
    set({ presets })
    persistLive(get)
    return true
  },

  restorePreset: (id) => {
    const preset = get().presets.find((item) => item.id === id)
    if (!preset) return false
    set(cloneSnapshot(preset))
    persistLive(get)
    return true
  },

  deletePreset: (id) => {
    const presets = get().presets.filter((preset) => preset.id !== id)
    if (presets.length === get().presets.length) return
    set({ presets })
    persistLive(get)
  },

  resetAll: () => {
    set({
      colors: {},
      crosshair: DEFAULT_CROSSHAIR,
      priceScale: DEFAULT_PRICE_SCALE,
      timeScale: DEFAULT_TIME_SCALE
    })
    persistLive(get)
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
