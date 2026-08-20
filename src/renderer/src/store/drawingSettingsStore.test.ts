import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DRAWING_STYLE,
  DEFAULT_TOOL_DEFAULTS,
  DRAWING_TOOL_TYPES,
  PRESET_NAME_MAX_LENGTH,
  useDrawingSettingsStore,
  defaultStyleForTool
} from '@/store/drawingSettingsStore'
import { DEFAULT_FIB_LEVELS } from '@/lib/chart/drawingGeometry'
import type { DrawingStyle, FibLevelConfig } from '@/lib/chart/drawingGeometry'

function freshStore() {
  const toolDefaults = {} as Record<string, DrawingStyle>
  const presets = {} as Record<string, never[]>
  const widgetFields = {} as Record<
    string,
    {
      color: boolean
      fillColor: boolean
      lineWidth: boolean
      lineStyle: boolean
      tpColor: boolean
      slColor: boolean
    }
  >
  for (const tool of DRAWING_TOOL_TYPES) {
    toolDefaults[tool] = { ...DEFAULT_TOOL_DEFAULTS[tool] }
    presets[tool] = []
    widgetFields[tool] = {
      color: true,
      fillColor: tool === 'rect',
      lineWidth: true,
      lineStyle: true,
      tpColor: false,
      slColor: false
    }
  }
  useDrawingSettingsStore.setState({
    toolDefaults,
    presets,
    widgetFields,
    fibLevels: DEFAULT_FIB_LEVELS.map((level) => ({ ...level })),
    drawingDialogOpen: false,
    drawingDialogSource: null
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('defaultStyleForTool', () => {
  it('returns a clone of the current default for a tool', () => {
    freshStore()
    useDrawingSettingsStore.getState().setToolDefault('long', { color: '#123456' })
    expect(defaultStyleForTool('long')).toEqual({
      ...DEFAULT_TOOL_DEFAULTS.long,
      color: '#123456'
    })
    expect(defaultStyleForTool('long')).not.toBe(
      useDrawingSettingsStore.getState().toolDefaults.long
    )
  })
})

describe('tool defaults', () => {
  it('updates the default style for a tool', () => {
    freshStore()
    const store = useDrawingSettingsStore.getState()
    store.setToolDefault('fib', { color: '#0ABF0A', lineWidth: 4 })
    const next = useDrawingSettingsStore.getState().toolDefaults.fib
    expect(next.color).toBe('#0ABF0A')
    expect(next.lineWidth).toBe(4)
    expect(next.lineStyle).toBe(DEFAULT_TOOL_DEFAULTS.fib.lineStyle)
  })

  it('clamps invalid colors, widths and styles', () => {
    freshStore()
    const store = useDrawingSettingsStore.getState()
    store.setToolDefault('trendline', {
      color: 'red',
      lineWidth: 99,
      lineStyle: 7
    })
    expect(useDrawingSettingsStore.getState().toolDefaults.trendline).toEqual(
      DEFAULT_TOOL_DEFAULTS.trendline
    )
  })

  it('resets a tool default to the shipped fallback', () => {
    freshStore()
    useDrawingSettingsStore.getState().setToolDefault('short', { color: '#000000' })
    useDrawingSettingsStore.getState().resetToolDefaults('short')
    expect(useDrawingSettingsStore.getState().toolDefaults.short).toEqual(
      DEFAULT_TOOL_DEFAULTS.short
    )
  })

  it('updates and clamps tp/sl zone colors', () => {
    freshStore()
    const store = useDrawingSettingsStore.getState()
    store.setToolDefault('long', { tpColor: '#00FF00', slColor: '#FF0000' })
    const next = useDrawingSettingsStore.getState().toolDefaults.long
    expect(next.tpColor).toBe('#00FF00')
    expect(next.slColor).toBe('#FF0000')
    store.setToolDefault('long', { tpColor: 'nope', slColor: 5 as never })
    const clamped = useDrawingSettingsStore.getState().toolDefaults.long
    expect(clamped.tpColor).toBe('#26A69A')
    expect(clamped.slColor).toBe('#EF5350')
  })

  it('updates and clamps rectangle fill color, including rgba opacity', () => {
    freshStore()
    const store = useDrawingSettingsStore.getState()
    store.setToolDefault('rect', { fillColor: '#123456' })
    expect(useDrawingSettingsStore.getState().toolDefaults.rect.fillColor).toBe('#123456')
    store.setToolDefault('rect', { fillColor: 'rgba(18, 52, 86, 0.4)' })
    expect(useDrawingSettingsStore.getState().toolDefaults.rect.fillColor).toBe(
      'rgba(18, 52, 86, 0.4)'
    )
    store.setToolDefault('rect', { fillColor: 'nope' })
    expect(useDrawingSettingsStore.getState().toolDefaults.rect.fillColor).toBe(
      DEFAULT_DRAWING_STYLE.fillColor
    )
  })
})

describe('presets', () => {
  it('saves a preset with the current tool default', () => {
    freshStore()
    useDrawingSettingsStore.getState().setToolDefault('hline', { color: '#AAFF00' })
    const ok = useDrawingSettingsStore.getState().savePreset('hline', 'My style')
    expect(ok).toBe(true)
    const [preset] = useDrawingSettingsStore.getState().presets.hline
    expect(preset.name).toBe('My style')
    expect(preset.color).toBe('#AAFF00')
  })

  it('overwrites a preset with the same name case-insensitively', () => {
    freshStore()
    const first = useDrawingSettingsStore
      .getState()
      .savePreset('rect', 'Blue', { color: '#0000FF', lineWidth: 1, lineStyle: 0 })
    expect(first).toBe(true)
    const saved = useDrawingSettingsStore.getState().presets.rect
    const id = saved[0].id
    useDrawingSettingsStore.getState().savePreset('rect', 'blue', {
      color: '#00FF00',
      lineWidth: 2,
      lineStyle: 1
    })
    const presets = useDrawingSettingsStore.getState().presets.rect
    expect(presets).toHaveLength(1)
    expect(presets[0].id).toBe(id)
    expect(presets[0].color).toBe('#00FF00')
  })

  it('rejects empty preset names', () => {
    freshStore()
    const ok = useDrawingSettingsStore.getState().savePreset('long', '   ')
    expect(ok).toBe(false)
    expect(useDrawingSettingsStore.getState().presets.long).toHaveLength(0)
  })

  it('truncates overly long preset names', () => {
    freshStore()
    useDrawingSettingsStore
      .getState()
      .savePreset('trendline', 'x'.repeat(PRESET_NAME_MAX_LENGTH + 20))
    const [preset] = useDrawingSettingsStore.getState().presets.trendline
    expect(preset.name.length).toBe(PRESET_NAME_MAX_LENGTH)
  })

  it('restores a preset onto the tool default and fails for unknown ids', () => {
    freshStore()
    useDrawingSettingsStore.getState().savePreset('fib', 'Gold', {
      color: '#FFD700',
      lineWidth: 3,
      lineStyle: 2
    })
    const id = useDrawingSettingsStore.getState().presets.fib[0].id
    expect(useDrawingSettingsStore.getState().restorePreset('fib', id)).toBe(true)
    expect(useDrawingSettingsStore.getState().toolDefaults.fib).toMatchObject({
      color: '#FFD700',
      lineWidth: 3,
      lineStyle: 2
    })
    expect(useDrawingSettingsStore.getState().restorePreset('fib', 'nope')).toBe(false)
  })

  it('deletes a preset', () => {
    freshStore()
    useDrawingSettingsStore.getState().savePreset('short', 'Red', {
      color: '#FF0000',
      lineWidth: 2,
      lineStyle: 0
    })
    const id = useDrawingSettingsStore.getState().presets.short[0].id
    useDrawingSettingsStore.getState().deletePreset('short', id)
    expect(useDrawingSettingsStore.getState().presets.short).toHaveLength(0)
  })
})

describe('widget fields', () => {
  it('toggles a widget field for a tool', () => {
    freshStore()
    useDrawingSettingsStore.getState().setWidgetField('rect', 'lineStyle', false)
    expect(useDrawingSettingsStore.getState().widgetFields.rect.lineStyle).toBe(false)
    expect(useDrawingSettingsStore.getState().widgetFields.rect.color).toBe(true)
    expect(useDrawingSettingsStore.getState().widgetFields.rect.fillColor).toBe(true)
  })

  it('toggles background fill on the rectangle widget', () => {
    freshStore()
    useDrawingSettingsStore.getState().setWidgetField('rect', 'fillColor', false)
    expect(useDrawingSettingsStore.getState().widgetFields.rect.fillColor).toBe(false)
  })
})

describe('fib levels', () => {
  it('starts with the default ratio set', () => {
    freshStore()
    expect(useDrawingSettingsStore.getState().fibLevels).toEqual(
      DEFAULT_FIB_LEVELS.map((level) => ({ ...level }))
    )
  })

  it('sets and clamps a custom level list', () => {
    freshStore()
    const store = useDrawingSettingsStore.getState()
    const next: FibLevelConfig[] = [
      { ratio: 999, color: '#00FF00', lineStyle: 2 },
      { ratio: 0.5 },
      { ratio: 'x' as never }
    ]
    store.setFibLevels(next)
    const levels = useDrawingSettingsStore.getState().fibLevels
    expect(levels).toEqual([
      { ratio: 20, color: '#00FF00', lineStyle: 2 },
      { ratio: 0.5 }
    ])
  })

  it('allows clearing every level', () => {
    freshStore()
    useDrawingSettingsStore.getState().setFibLevels([])
    expect(useDrawingSettingsStore.getState().fibLevels).toEqual([])
  })

  it('resets to the shipped defaults', () => {
    freshStore()
    useDrawingSettingsStore.getState().setFibLevels([{ ratio: 0.786 }])
    useDrawingSettingsStore.getState().resetFibLevels()
    expect(useDrawingSettingsStore.getState().fibLevels).toEqual(
      DEFAULT_FIB_LEVELS.map((level) => ({ ...level }))
    )
  })

  it('persists fib level edits', async () => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      }
    })
    vi.resetModules()
    const mod = await import('@/store/drawingSettingsStore')
    mod.useDrawingSettingsStore.getState().setFibLevels([{ ratio: 0.786, color: '#123456' }])
    const raw = store['easy-candle:drawing-settings']
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw ?? '{}') as { fibLevels: FibLevelConfig[] }
    expect(parsed.fibLevels).toEqual([{ ratio: 0.786, color: '#123456' }])
  })
})

describe('dialog state', () => {
  it('opens and closes', () => {
    freshStore()
    useDrawingSettingsStore.getState().setDrawingDialogOpen(true)
    expect(useDrawingSettingsStore.getState().drawingDialogOpen).toBe(true)
    useDrawingSettingsStore.getState().setDrawingDialogOpen(false)
    expect(useDrawingSettingsStore.getState().drawingDialogOpen).toBe(false)
  })
})

describe('persistence', () => {
  it('sanitizes a stored payload before it is used', async () => {
    const store = {
      'easy-candle:drawing-settings': JSON.stringify({
        toolDefaults: {
          hline: { color: 'garbage', lineWidth: 99, lineStyle: 7 },
          long: { color: '#123456', lineWidth: 1, lineStyle: 4 }
        },
        widgetFields: {
          rect: { color: 'no', lineWidth: false }
        },
        presets: {
          fib: [
            { id: 'p1', name: 'ok', savedAt: 1, color: '#ABC123', lineWidth: 2, lineStyle: 1 },
            { id: 'p1', name: 'dupe', savedAt: 2 },
            { id: 'p2', name: '   ', savedAt: 3 }
          ]
        }
      })
    }
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
      setItem: (_key: string, value: string) => {
        store['easy-candle:drawing-settings'] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      }
    })
    vi.resetModules()
    const mod = await import('@/store/drawingSettingsStore')
    const state = mod.useDrawingSettingsStore.getState()
    expect(state.toolDefaults.hline).toEqual(DEFAULT_TOOL_DEFAULTS.hline)
    expect(state.toolDefaults.long).toEqual({
      color: '#123456',
      lineWidth: 1,
      lineStyle: 4,
      fillColor: DEFAULT_DRAWING_STYLE.fillColor,
      tpColor: '#26A69A',
      slColor: '#EF5350'
    })
    expect(state.widgetFields.rect.color).toBe(true)
    expect(state.widgetFields.rect.lineWidth).toBe(false)
    expect(state.widgetFields.rect.fillColor).toBe(true)
    const presets = state.presets.fib
    expect(presets).toHaveLength(1)
    expect(presets[0]).toMatchObject({
      id: 'p1',
      name: 'ok',
      color: '#ABC123',
      lineWidth: 2,
      lineStyle: 1
    })
  })

  it('persists edits back to localStorage', async () => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      }
    })
    vi.resetModules()
    const mod = await import('@/store/drawingSettingsStore')
    mod.useDrawingSettingsStore.getState().setToolDefault('long', { color: '#00AA00' })
    const raw = store['easy-candle:drawing-settings']
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw ?? '{}') as { toolDefaults: Record<string, unknown> }
    expect(parsed.toolDefaults.long).toMatchObject({ color: '#00AA00' })
  })
})