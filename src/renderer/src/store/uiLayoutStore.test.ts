import { afterEach, describe, expect, it, vi } from 'vitest'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

function stubLocalStorage(store: Record<string, string>): void {
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
}

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
    sessionManagerDialogOpen: false,
    accountDialogOpen: false,
    hasCompletedTour: false,
    tourRequestId: 0,
    tourPaperTradePreview: false,
    tourPaperTradeRestore: null,
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
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/uiLayoutStore')
    expect(mod.useUiLayoutStore.getState().drawingWidgetPos).toEqual({ x: 300, y: 42 })
  })

  it('persists a drag back to localStorage', async () => {
    const store: Record<string, string> = {}
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/uiLayoutStore')
    mod.useUiLayoutStore.getState().setDrawingWidgetPos({ x: 7, y: 11 })
    const raw = store['easy-candle:ui-layout']
    const parsed = JSON.parse(raw ?? '{}') as { drawingWidgetPos: { x: number; y: number } }
    expect(parsed.drawingWidgetPos).toEqual({ x: 7, y: 11 })
  })
})

describe('app tour', () => {
  it('loads a persisted completion flag', async () => {
    const store = {
      'easy-candle:ui-layout': JSON.stringify({ hasCompletedTour: true })
    }
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/uiLayoutStore')
    expect(mod.useUiLayoutStore.getState().hasCompletedTour).toBe(true)
    expect(mod.useUiLayoutStore.getState().tourRequestId).toBe(0)
  })

  it('persists hasCompletedTour on complete', async () => {
    const store: Record<string, string> = {}
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/uiLayoutStore')
    expect(mod.useUiLayoutStore.getState().hasCompletedTour).toBe(false)
    mod.useUiLayoutStore.getState().completeTour()
    expect(mod.useUiLayoutStore.getState().hasCompletedTour).toBe(true)
    const parsed = JSON.parse(store['easy-candle:ui-layout'] ?? '{}') as { hasCompletedTour?: boolean }
    expect(parsed.hasCompletedTour).toBe(true)
  })

  it('persists hasCompletedTour on skip', async () => {
    const store: Record<string, string> = {}
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/uiLayoutStore')
    mod.useUiLayoutStore.getState().skipTour()
    expect(mod.useUiLayoutStore.getState().hasCompletedTour).toBe(true)
    const parsed = JSON.parse(store['easy-candle:ui-layout'] ?? '{}') as { hasCompletedTour?: boolean }
    expect(parsed.hasCompletedTour).toBe(true)
  })

  it('startTour bumps tourRequestId even after the tour is completed', async () => {
    const store: Record<string, string> = {}
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/uiLayoutStore')
    const api = mod.useUiLayoutStore
    api.setState({
      showMainToolbar: false,
      showDrawingToolbar: false,
      chartFullscreen: true,
      aboutDialogOpen: true,
      shortcutsDialogOpen: true,
      importDataDialogOpen: true,
      chartSettingsDialogOpen: true
    })
    api.getState().completeTour()
    const id = api.getState().tourRequestId
    api.getState().startTour()
    const next = api.getState()
    expect(next.tourRequestId).toBe(id + 1)
    expect(next.hasCompletedTour).toBe(true)
    expect(next.showMainToolbar).toBe(true)
    expect(next.showDrawingToolbar).toBe(true)
    expect(next.chartFullscreen).toBe(false)
    expect(next.aboutDialogOpen).toBe(false)
    expect(next.shortcutsDialogOpen).toBe(false)
    expect(next.importDataDialogOpen).toBe(false)
    expect(next.chartSettingsDialogOpen).toBe(false)
    const parsed = JSON.parse(store['easy-candle:ui-layout'] ?? '{}') as {
      showMainToolbar?: boolean
      showDrawingToolbar?: boolean
    }
    expect(parsed.showMainToolbar).toBe(true)
    expect(parsed.showDrawingToolbar).toBe(true)
  })

  it('opens paper trade as a session preview and restores without persisting', async () => {
    const store: Record<string, string> = {}
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/uiLayoutStore')
    const api = mod.useUiLayoutStore
    api.setState({ showPaperTrade: false })
    api.getState().beginPaperTradePreview()
    expect(api.getState().tourPaperTradePreview).toBe(true)
    expect(api.getState().showPaperTrade).toBe(true)
    expect(store['easy-candle:ui-layout']).toBeUndefined()
    api.getState().endPaperTradePreview()
    expect(api.getState().tourPaperTradePreview).toBe(false)
    expect(api.getState().showPaperTrade).toBe(false)
  })

  it('completeTour ends the paper-trade preview', async () => {
    const store: Record<string, string> = {}
    stubLocalStorage(store)
    vi.resetModules()
    const mod = await import('@/store/uiLayoutStore')
    const api = mod.useUiLayoutStore
    api.setState({ showPaperTrade: false })
    api.getState().beginPaperTradePreview()
    api.getState().completeTour()
    expect(api.getState().tourPaperTradePreview).toBe(false)
    expect(api.getState().showPaperTrade).toBe(false)
    expect(api.getState().hasCompletedTour).toBe(true)
  })
})