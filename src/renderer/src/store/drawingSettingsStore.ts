import { create } from 'zustand'
import { LineStyle } from 'lightweight-charts'
import {
  cloneFibLevels,
  DEFAULT_FIB_LEVELS,
  type DrawingLineStyle,
  type DrawingStyle,
  type DrawingToolType,
  type FibLevelConfig
} from '@/lib/chart/drawingGeometry'
import { DEFAULT_FILL_OPACITY, sanitizeCssColor, withAlpha } from '@/lib/cssColor'

const STORAGE_KEY = 'easy-candle:drawing-settings'

export const DRAWING_TOOL_TYPES: readonly DrawingToolType[] = [
  'hline',
  'trendline',
  'fib',
  'rect',
  'long',
  'short'
]

export const PRESET_NAME_MAX_LENGTH = 48

/** Default zone fills for position tools (TP green, SL red), used when a style omits them. */
export const DEFAULT_ZONE_COLORS = {
  tp: '#26A69A',
  sl: '#EF5350'
}

export const DEFAULT_DRAWING_STYLE: DrawingStyle = {
  color: '#f23645',
  lineWidth: 2,
  lineStyle: LineStyle.Solid,
  fillColor: withAlpha('#f23645', DEFAULT_FILL_OPACITY),
  tpColor: DEFAULT_ZONE_COLORS.tp,
  slColor: DEFAULT_ZONE_COLORS.sl
}

export const DEFAULT_TOOL_DEFAULTS: Record<DrawingToolType, DrawingStyle> = {
  hline: { ...DEFAULT_DRAWING_STYLE },
  trendline: { ...DEFAULT_DRAWING_STYLE },
  fib: { ...DEFAULT_DRAWING_STYLE },
  rect: { ...DEFAULT_DRAWING_STYLE },
  long: { ...DEFAULT_DRAWING_STYLE, color: '#10B981' },
  short: { ...DEFAULT_DRAWING_STYLE, color: '#F23645' }
}

export type WidgetFieldKey =
  | 'color'
  | 'fillColor'
  | 'lineWidth'
  | 'lineStyle'
  | 'tpColor'
  | 'slColor'
export type WidgetFieldSet = Record<WidgetFieldKey, boolean>

export const DEFAULT_WIDGET_FIELDS: Record<DrawingToolType, WidgetFieldSet> = {
  hline: {
    color: true,
    fillColor: false,
    lineWidth: true,
    lineStyle: true,
    tpColor: false,
    slColor: false
  },
  trendline: {
    color: true,
    fillColor: false,
    lineWidth: true,
    lineStyle: true,
    tpColor: false,
    slColor: false
  },
  fib: {
    color: true,
    fillColor: false,
    lineWidth: true,
    lineStyle: true,
    tpColor: false,
    slColor: false
  },
  rect: {
    color: true,
    fillColor: true,
    lineWidth: true,
    lineStyle: true,
    tpColor: false,
    slColor: false
  },
  long: {
    color: true,
    fillColor: false,
    lineWidth: true,
    lineStyle: true,
    tpColor: true,
    slColor: true
  },
  short: {
    color: true,
    fillColor: false,
    lineWidth: true,
    lineStyle: true,
    tpColor: true,
    slColor: true
  }
}

export type DrawingPreset = DrawingStyle & {
  id: string
  name: string
  savedAt: number
}

export type ToolPresets = Record<DrawingToolType, DrawingPreset[]>

type PersistedDrawingSettings = {
  toolDefaults: Record<DrawingToolType, DrawingStyle>
  presets: ToolPresets
  widgetFields: Record<DrawingToolType, WidgetFieldSet>
  /** Default Fibonacci level set for new fib drawings. */
  fibLevels: FibLevelConfig[]
}

type DrawingSettingsState = PersistedDrawingSettings & {
  drawingDialogOpen: boolean
  /** How the dialog was opened: 'toolbar' shows the tool selector, 'widget' hides it. */
  drawingDialogSource: 'toolbar' | 'widget' | null
  setToolDefault: (tool: DrawingToolType, patch: Partial<DrawingStyle>) => void
  savePreset: (tool: DrawingToolType, name: string, style?: DrawingStyle) => boolean
  restorePreset: (tool: DrawingToolType, presetId: string) => boolean
  deletePreset: (tool: DrawingToolType, presetId: string) => void
  setWidgetField: (tool: DrawingToolType, key: WidgetFieldKey, value: boolean) => void
  resetToolDefaults: (tool: DrawingToolType) => void
  setFibLevels: (levels: FibLevelConfig[]) => void
  resetFibLevels: () => void
  setDrawingDialogOpen: (open: boolean, source?: 'toolbar' | 'widget') => void
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

function isLineWidth(value: unknown): value is number {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function isLineStyle(value: unknown): value is DrawingLineStyle {
  return (
    value === 0 || value === 1 || value === 2 || value === 3 || value === 4
  )
}

function sanitizeStyle(raw: unknown, fallback: DrawingStyle): DrawingStyle {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const source = raw as Partial<DrawingStyle>
  return {
    color: isHexColor(source.color) ? source.color : fallback.color,
    lineWidth: isLineWidth(source.lineWidth) ? source.lineWidth : fallback.lineWidth,
    lineStyle: isLineStyle(source.lineStyle) ? source.lineStyle : fallback.lineStyle,
    fillColor: sanitizeCssColor(source.fillColor, fallback.fillColor ?? DEFAULT_DRAWING_STYLE.fillColor!),
    tpColor: isHexColor(source.tpColor) ? source.tpColor : fallback.tpColor,
    slColor: isHexColor(source.slColor) ? source.slColor : fallback.slColor
  }
}

function sanitizeToolDefaults(raw: unknown): Record<DrawingToolType, DrawingStyle> {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = {} as Record<DrawingToolType, DrawingStyle>
  for (const tool of DRAWING_TOOL_TYPES) {
    out[tool] = sanitizeStyle(source[tool], DEFAULT_TOOL_DEFAULTS[tool])
  }
  return out
}

function sanitizeWidgetFields(
  raw: unknown
): Record<DrawingToolType, WidgetFieldSet> {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = {} as Record<DrawingToolType, WidgetFieldSet>
  for (const tool of DRAWING_TOOL_TYPES) {
    const rec =
      source[tool] && typeof source[tool] === 'object'
        ? (source[tool] as Partial<WidgetFieldSet>)
        : {}
    out[tool] = {
      color:
        typeof rec.color === 'boolean' ? rec.color : DEFAULT_WIDGET_FIELDS[tool].color,
      fillColor:
        typeof rec.fillColor === 'boolean'
          ? rec.fillColor
          : DEFAULT_WIDGET_FIELDS[tool].fillColor,
      lineWidth:
        typeof rec.lineWidth === 'boolean'
          ? rec.lineWidth
          : DEFAULT_WIDGET_FIELDS[tool].lineWidth,
      lineStyle:
        typeof rec.lineStyle === 'boolean'
          ? rec.lineStyle
          : DEFAULT_WIDGET_FIELDS[tool].lineStyle,
      tpColor:
        typeof rec.tpColor === 'boolean'
          ? rec.tpColor
          : DEFAULT_WIDGET_FIELDS[tool].tpColor,
      slColor:
        typeof rec.slColor === 'boolean'
          ? rec.slColor
          : DEFAULT_WIDGET_FIELDS[tool].slColor
    }
  }
  return out
}

function sanitizePresets(raw: unknown): ToolPresets {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = {} as ToolPresets
  for (const tool of DRAWING_TOOL_TYPES) {
    const list = source[tool]
    if (!Array.isArray(list)) {
      out[tool] = []
      continue
    }
    const seen = new Set<string>()
    const presets: DrawingPreset[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const name =
        typeof rec.name === 'string' ? rec.name.trim().slice(0, PRESET_NAME_MAX_LENGTH) : ''
      if (!name) continue
      const id = typeof rec.id === 'string' && rec.id.length > 0 ? rec.id : crypto.randomUUID()
      if (seen.has(id)) continue
      seen.add(id)
      const savedAt =
        typeof rec.savedAt === 'number' && Number.isFinite(rec.savedAt)
          ? rec.savedAt
          : Date.now()
      presets.push({
        id,
        name,
        savedAt,
        ...sanitizeStyle(rec, DEFAULT_TOOL_DEFAULTS[tool])
      })
    }
    out[tool] = presets
  }
  return out
}

const FIB_RATIO_CLAMP = 20

function sanitizeFibLevels(raw: unknown): FibLevelConfig[] {
  if (!Array.isArray(raw)) return cloneFibLevels(DEFAULT_FIB_LEVELS)
  const levels: FibLevelConfig[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (typeof rec.ratio !== 'number' || !Number.isFinite(rec.ratio)) continue
    const ratio = Math.max(
      -FIB_RATIO_CLAMP,
      Math.min(FIB_RATIO_CLAMP, Math.round(rec.ratio * 10000) / 10000)
    )
    const level: FibLevelConfig = { ratio }
    if (isHexColor(rec.color)) level.color = rec.color
    if (isLineStyle(rec.lineStyle)) level.lineStyle = rec.lineStyle
    levels.push(level)
  }
  return levels
}

function cloneDefaults(): Record<DrawingToolType, DrawingStyle> {
  const out = {} as Record<DrawingToolType, DrawingStyle>
  for (const tool of DRAWING_TOOL_TYPES) {
    out[tool] = { ...DEFAULT_TOOL_DEFAULTS[tool] }
  }
  return out
}

function cloneWidgetFields(): Record<DrawingToolType, WidgetFieldSet> {
  const out = {} as Record<DrawingToolType, WidgetFieldSet>
  for (const tool of DRAWING_TOOL_TYPES) {
    out[tool] = { ...DEFAULT_WIDGET_FIELDS[tool] }
  }
  return out
}

function emptyPresets(): ToolPresets {
  const out = {} as ToolPresets
  for (const tool of DRAWING_TOOL_TYPES) {
    out[tool] = []
  }
  return out
}

const EMPTY_SETTINGS: PersistedDrawingSettings = {
  toolDefaults: cloneDefaults(),
  presets: emptyPresets(),
  widgetFields: cloneWidgetFields(),
  fibLevels: cloneFibLevels(DEFAULT_FIB_LEVELS)
}

function loadPersisted(): PersistedDrawingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_SETTINGS
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return EMPTY_SETTINGS
    const rec = parsed as Record<string, unknown>
    const loadedFibLevels = sanitizeFibLevels(rec.fibLevels)
    return {
      toolDefaults: sanitizeToolDefaults(rec.toolDefaults),
      presets: sanitizePresets(rec.presets),
      widgetFields: sanitizeWidgetFields(rec.widgetFields),
      fibLevels:
        loadedFibLevels.length > 0 ? loadedFibLevels : cloneFibLevels(DEFAULT_FIB_LEVELS)
    }
  } catch {
    return EMPTY_SETTINGS
  }
}

function persist(partial: Partial<PersistedDrawingSettings>): void {
  try {
    const current = loadPersisted()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...partial }))
  } catch {
    // ignore quota / private mode
  }
}

function persistLive(get: () => DrawingSettingsState): void {
  persist({
    toolDefaults: get().toolDefaults,
    presets: get().presets,
    widgetFields: get().widgetFields,
    fibLevels: get().fibLevels
  })
}

function clampStyle(style: DrawingStyle): DrawingStyle {
  return {
    color: isHexColor(style.color) ? style.color : DEFAULT_DRAWING_STYLE.color,
    lineWidth: isLineWidth(style.lineWidth) ? style.lineWidth : DEFAULT_DRAWING_STYLE.lineWidth,
    lineStyle: isLineStyle(style.lineStyle)
      ? style.lineStyle
      : DEFAULT_DRAWING_STYLE.lineStyle,
    fillColor: sanitizeCssColor(style.fillColor, DEFAULT_DRAWING_STYLE.fillColor!),
    tpColor: isHexColor(style.tpColor) ? style.tpColor : DEFAULT_DRAWING_STYLE.tpColor,
    slColor: isHexColor(style.slColor) ? style.slColor : DEFAULT_DRAWING_STYLE.slColor
  }
}

const initial = loadPersisted()

export const useDrawingSettingsStore = create<DrawingSettingsState>((set, get) => ({
  toolDefaults: initial.toolDefaults,
  presets: initial.presets,
  widgetFields: initial.widgetFields,
  fibLevels: initial.fibLevels,
  drawingDialogOpen: false,
  drawingDialogSource: null,

  setToolDefault(tool, patch) {
    const next = clampStyle({ ...get().toolDefaults[tool], ...patch })
    set({ toolDefaults: { ...get().toolDefaults, [tool]: next } })
    persistLive(get)
  },

  savePreset(tool, name, style) {
    const trimmed = name.trim().slice(0, PRESET_NAME_MAX_LENGTH)
    if (!trimmed) return false
    const savedStyle = clampStyle(style ?? get().toolDefaults[tool])
    const existing = get().presets[tool].find(
      (preset) => preset.name.toLowerCase() === trimmed.toLowerCase()
    )
    const nextPreset: DrawingPreset = {
      id: existing?.id ?? crypto.randomUUID(),
      name: trimmed,
      savedAt: Date.now(),
      ...savedStyle
    }
    const presets = existing
      ? get().presets[tool].map((preset) =>
          preset.id === existing.id ? nextPreset : preset
        )
      : [...get().presets[tool], nextPreset]
    set({ presets: { ...get().presets, [tool]: presets } })
    persistLive(get)
    return true
  },

  restorePreset(tool, presetId) {
    const preset = get().presets[tool].find((item) => item.id === presetId)
    if (!preset) return false
    get().setToolDefault(tool, {
      color: preset.color,
      lineWidth: preset.lineWidth,
      lineStyle: preset.lineStyle,
      fillColor: preset.fillColor,
      tpColor: preset.tpColor,
      slColor: preset.slColor
    })
    return true
  },

  deletePreset(tool, presetId) {
    const presets = get().presets[tool].filter((preset) => preset.id !== presetId)
    if (presets.length === get().presets[tool].length) return
    set({ presets: { ...get().presets, [tool]: presets } })
    persistLive(get)
  },

  setWidgetField(tool, key, value) {
    const fields = { ...get().widgetFields[tool], [key]: value }
    set({ widgetFields: { ...get().widgetFields, [tool]: fields } })
    persistLive(get)
  },

  resetToolDefaults(tool) {
    get().setToolDefault(tool, DEFAULT_TOOL_DEFAULTS[tool])
  },

  setFibLevels(levels) {
    const sanitized = sanitizeFibLevels(levels)
    set({ fibLevels: sanitized })
    persistLive(get)
  },

  resetFibLevels() {
    set({ fibLevels: cloneFibLevels(DEFAULT_FIB_LEVELS) })
    persistLive(get)
  },

  setDrawingDialogOpen(open, source) {
    set({
      drawingDialogOpen: open,
      drawingDialogSource: open ? source ?? null : null
    })
  }
}))

/** Clone of the persisted default style used by newly drawn tools. */
export function defaultStyleForTool(tool: DrawingToolType): DrawingStyle {
  return { ...useDrawingSettingsStore.getState().toolDefaults[tool] }
}

/** Clone of the persisted default Fibonacci level set used by newly drawn fibs. */
export function defaultFibLevelsForTool(): FibLevelConfig[] {
  return cloneFibLevels(useDrawingSettingsStore.getState().fibLevels)
}