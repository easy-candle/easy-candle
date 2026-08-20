import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

function freshStore() {
  useUiLayoutStore.setState({
    chartFullscreen: false,
    replayControlsMinimized: false,
    replayControlsPos: null,
    tradePanelPos: null,
    drawingWidgetPos: null,
    showMainToolbar: true,
    showStatusBar: true,
    showDrawingToolbar: true,
    showReplayControls: true,
    showPaperTrade: true,
    shortcutsDialogOpen: false,
    aboutDialogOpen: false,
    importDataDialogOpen: false,
    chartSettingsDialogOpen: false,
    primaryChart: null
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('drawing widget position', () => {
  it('stores the dragged position and skips no-op writes', () => {
    freshStore()
    const store = useUiLayoutStore.getState()
    store.setDrawingWidgetPos({ x: 120, y: 90 })
    expect(useUiLayoutStore.getState().drawingWidgetPos).toEqual({ x: 120, y: 90 })
    store.setDrawingWidgetPos({ x: 120, y: 90 })
    expect(useUiLayoutStore.getState().drawingWidgetPos).toEqual({ x: 120, y: 90 })
  })

  it('loads a persisted position on init and ignores invalid ones', async () => {
    const store = {
      'easy-candle:ui-layout': JSON.stringify({
        drawingWidgetPos: { x: 300, y: 42 }
      })
    }
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
    const mod = await import('@/store/uiLayoutStore')
    expect(mod.useUiLayoutStore.getState().drawingWidgetPos).toEqual({ x: 300, y: 42 })
  })

  it('persists a drag back to localStorage', async () => {
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
    const mod = await import('@/store/uiLayoutStore')
    mod.useUiLayoutStore.getState().setDrawingWidgetPos({ x: 7, y: 11 })
    const raw = store['easy-candle:ui-layout']
    const parsed = JSON.parse(raw ?? '{}') as { drawingWidgetPos: { x: number; y: number } }
    expect(parsed.drawingWidgetPos).toEqual({ x: 7, y: 11 })
  })
})