import { create } from 'zustand'
import type { IChartApi } from 'lightweight-charts'

const STORAGE_KEY = 'easy-candle:ui-layout'

export type PanelPos = { x: number; y: number }

type PersistedLayout = {
  replayControlsMinimized?: boolean
  replayControlsPos?: PanelPos
  tradePanelPos?: PanelPos
  drawingWidgetPos?: PanelPos
  showMainToolbar?: boolean
  showStatusBar?: boolean
  showDrawingToolbar?: boolean
  showReplayControls?: boolean
  showPaperTrade?: boolean
  hasCompletedTour?: boolean
}

type UiLayoutState = {
  chartFullscreen: boolean
  replayControlsMinimized: boolean
  /** null means use default placement (bottom-center) on first layout */
  replayControlsPos: PanelPos | null
  tradePanelPos: PanelPos | null
  /** Last dragged position of the drawing-style floating widget; null re-anchors to the drawing. */
  drawingWidgetPos: PanelPos | null
  showMainToolbar: boolean
  showStatusBar: boolean
  showDrawingToolbar: boolean
  showReplayControls: boolean
  showPaperTrade: boolean
  shortcutsDialogOpen: boolean
  aboutDialogOpen: boolean
  importDataDialogOpen: boolean
  chartSettingsDialogOpen: boolean
  symbolManagerDialogOpen: boolean
  sessionManagerDialogOpen: boolean
  hasCompletedTour: boolean
  /** Session-only counter; bumping it asks AppTour to (re)start. */
  tourRequestId: number
  /** Session-only: show the paper-trade chrome during the tour without entering replay. */
  tourPaperTradePreview: boolean
  /** Session-only: `showPaperTrade` to restore after the tour preview. */
  tourPaperTradeRestore: boolean | null
  /** Primary chart instance, used by chart snapshot actions. */
  primaryChart: IChartApi | null
  toggleChartFullscreen: () => void
  setChartFullscreen: (value: boolean) => void
  setReplayControlsMinimized: (value: boolean) => void
  setReplayControlsPos: (pos: PanelPos) => void
  setTradePanelPos: (pos: PanelPos) => void
  setDrawingWidgetPos: (pos: PanelPos) => void
  toggleMainToolbar: () => void
  toggleStatusBar: () => void
  toggleDrawingToolbar: () => void
  toggleReplayControls: () => void
  togglePaperTrade: () => void
  setShortcutsDialogOpen: (value: boolean) => void
  setAboutDialogOpen: (value: boolean) => void
  setImportDataDialogOpen: (value: boolean) => void
  setChartSettingsDialogOpen: (value: boolean) => void
  setSymbolManagerDialogOpen: (value: boolean) => void
  setSessionManagerDialogOpen: (value: boolean) => void
  startTour: () => void
  completeTour: () => void
  skipTour: () => void
  beginPaperTradePreview: () => void
  endPaperTradePreview: () => void
  setPrimaryChart: (chart: IChartApi | null) => void
}

function loadPersisted(): PersistedLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as PersistedLayout
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function persist(partial: PersistedLayout): void {
  try {
    const current = loadPersisted()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...partial }))
  } catch {
    // ignore quota / private mode
  }
}

function isValidPos(value: unknown): value is PanelPos {
  if (!value || typeof value !== 'object') return false
  const pos = value as PanelPos
  return (
    typeof pos.x === 'number' &&
    typeof pos.y === 'number' &&
    Number.isFinite(pos.x) &&
    Number.isFinite(pos.y)
  )
}

const initial = loadPersisted()

export const useUiLayoutStore = create<UiLayoutState>((set, get) => ({
  // Always launch in normal chrome; fullscreen is session-only.
  chartFullscreen: false,
  replayControlsMinimized: Boolean(initial.replayControlsMinimized),
  replayControlsPos: isValidPos(initial.replayControlsPos) ? initial.replayControlsPos : null,
  tradePanelPos: isValidPos(initial.tradePanelPos) ? initial.tradePanelPos : null,
  drawingWidgetPos: isValidPos(initial.drawingWidgetPos) ? initial.drawingWidgetPos : null,
  showMainToolbar: initial.showMainToolbar !== false,
  showStatusBar: initial.showStatusBar !== false,
  showDrawingToolbar: initial.showDrawingToolbar !== false,
  showReplayControls: initial.showReplayControls !== false,
  showPaperTrade: initial.showPaperTrade !== false,
  shortcutsDialogOpen: false,
  aboutDialogOpen: false,
  importDataDialogOpen: false,
  chartSettingsDialogOpen: false,
  symbolManagerDialogOpen: false,
  sessionManagerDialogOpen: false,
  hasCompletedTour: initial.hasCompletedTour === true,
  tourRequestId: 0,
  tourPaperTradePreview: false,
  tourPaperTradeRestore: null,
  primaryChart: null,

  toggleChartFullscreen: () => {
    set({ chartFullscreen: !get().chartFullscreen })
  },

  setChartFullscreen: (value) => {
    if (value === get().chartFullscreen) return
    set({ chartFullscreen: value })
  },

  setReplayControlsMinimized: (value) => {
    if (value === get().replayControlsMinimized) return
    set({ replayControlsMinimized: value })
    persist({ replayControlsMinimized: value })
  },

  setReplayControlsPos: (pos) => {
    const current = get().replayControlsPos
    if (current && current.x === pos.x && current.y === pos.y) return
    set({ replayControlsPos: pos })
    persist({ replayControlsPos: pos })
  },

  setTradePanelPos: (pos) => {
    const current = get().tradePanelPos
    if (current && current.x === pos.x && current.y === pos.y) return
    set({ tradePanelPos: pos })
    persist({ tradePanelPos: pos })
  },

  setDrawingWidgetPos: (pos) => {
    const current = get().drawingWidgetPos
    if (current && current.x === pos.x && current.y === pos.y) return
    set({ drawingWidgetPos: pos })
    persist({ drawingWidgetPos: pos })
  },

  toggleMainToolbar: () => {
    const value = !get().showMainToolbar
    set({ showMainToolbar: value })
    persist({ showMainToolbar: value })
  },

  toggleStatusBar: () => {
    const value = !get().showStatusBar
    set({ showStatusBar: value })
    persist({ showStatusBar: value })
  },

  toggleDrawingToolbar: () => {
    const value = !get().showDrawingToolbar
    set({ showDrawingToolbar: value })
    persist({ showDrawingToolbar: value })
  },

  toggleReplayControls: () => {
    const value = !get().showReplayControls
    set({ showReplayControls: value })
    persist({ showReplayControls: value })
  },

  togglePaperTrade: () => {
    const value = !get().showPaperTrade
    set({ showPaperTrade: value })
    persist({ showPaperTrade: value })
  },

  setShortcutsDialogOpen: (value) => {
    set({ shortcutsDialogOpen: value })
  },

  setAboutDialogOpen: (value) => {
    set({ aboutDialogOpen: value })
  },

  setImportDataDialogOpen: (value) => {
    set({ importDataDialogOpen: value })
  },

  setChartSettingsDialogOpen: (value) => {
    set({ chartSettingsDialogOpen: value })
  },

  setSymbolManagerDialogOpen: (value) => {
    set({ symbolManagerDialogOpen: value })
  },

  setSessionManagerDialogOpen: (value) => {
    set({ sessionManagerDialogOpen: value })
  },

  startTour: () => {
    const showMainToolbar = get().showMainToolbar
    const showDrawingToolbar = get().showDrawingToolbar
    const persistPatch: PersistedLayout = {}
    if (!showMainToolbar) persistPatch.showMainToolbar = true
    if (!showDrawingToolbar) persistPatch.showDrawingToolbar = true
    if (Object.keys(persistPatch).length > 0) persist(persistPatch)
    set({
      showMainToolbar: true,
      showDrawingToolbar: true,
      chartFullscreen: false,
      shortcutsDialogOpen: false,
      aboutDialogOpen: false,
      importDataDialogOpen: false,
      chartSettingsDialogOpen: false,
      symbolManagerDialogOpen: false,
      sessionManagerDialogOpen: false,
      tourRequestId: get().tourRequestId + 1
    })
  },

  completeTour: () => {
    get().endPaperTradePreview()
    if (get().hasCompletedTour) return
    set({ hasCompletedTour: true })
    persist({ hasCompletedTour: true })
  },

  skipTour: () => {
    get().completeTour()
  },

  beginPaperTradePreview: () => {
    if (get().tourPaperTradePreview) return
    set({
      tourPaperTradePreview: true,
      tourPaperTradeRestore: get().showPaperTrade,
      showPaperTrade: true
    })
  },

  endPaperTradePreview: () => {
    if (!get().tourPaperTradePreview && get().tourPaperTradeRestore == null) return
    const restore = get().tourPaperTradeRestore
    set({
      tourPaperTradePreview: false,
      tourPaperTradeRestore: null,
      showPaperTrade: restore ?? get().showPaperTrade
    })
  },

  setPrimaryChart: (chart) => {
    set({ primaryChart: chart })
  }
}))

/** Clamp a panel top-left position so the panel stays inside the container. */
export function clampPanelPos(
  pos: PanelPos,
  containerWidth: number,
  containerHeight: number,
  panelWidth: number,
  panelHeight: number,
  margin = 8
): PanelPos {
  const maxX = Math.max(margin, containerWidth - panelWidth - margin)
  const maxY = Math.max(margin, containerHeight - panelHeight - margin)
  return {
    x: Math.min(Math.max(margin, pos.x), maxX),
    y: Math.min(Math.max(margin, pos.y), maxY)
  }
}
