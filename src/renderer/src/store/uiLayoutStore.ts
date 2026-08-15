import { create } from 'zustand'

const STORAGE_KEY = 'easy-candle:ui-layout'

export type PanelPos = { x: number; y: number }

type PersistedLayout = {
  replayControlsMinimized?: boolean
  replayControlsPos?: PanelPos
  drawingToolbarPos?: PanelPos
  tradePanelPos?: PanelPos
  showMainToolbar?: boolean
  showStatusBar?: boolean
  showDrawingToolbar?: boolean
  showReplayControls?: boolean
  showPaperTrade?: boolean
}

type UiLayoutState = {
  chartFullscreen: boolean
  replayControlsMinimized: boolean
  /** null means use default placement (bottom-center) on first layout */
  replayControlsPos: PanelPos | null
  drawingToolbarPos: PanelPos | null
  tradePanelPos: PanelPos | null
  showMainToolbar: boolean
  showStatusBar: boolean
  showDrawingToolbar: boolean
  showReplayControls: boolean
  showPaperTrade: boolean
  shortcutsDialogOpen: boolean
  aboutDialogOpen: boolean
  toggleChartFullscreen: () => void
  setChartFullscreen: (value: boolean) => void
  setReplayControlsMinimized: (value: boolean) => void
  setReplayControlsPos: (pos: PanelPos) => void
  setDrawingToolbarPos: (pos: PanelPos) => void
  setTradePanelPos: (pos: PanelPos) => void
  toggleMainToolbar: () => void
  toggleStatusBar: () => void
  toggleDrawingToolbar: () => void
  toggleReplayControls: () => void
  togglePaperTrade: () => void
  setShortcutsDialogOpen: (value: boolean) => void
  setAboutDialogOpen: (value: boolean) => void
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
  drawingToolbarPos: isValidPos(initial.drawingToolbarPos) ? initial.drawingToolbarPos : null,
  tradePanelPos: isValidPos(initial.tradePanelPos) ? initial.tradePanelPos : null,
  showMainToolbar: initial.showMainToolbar !== false,
  showStatusBar: initial.showStatusBar !== false,
  showDrawingToolbar: initial.showDrawingToolbar !== false,
  showReplayControls: initial.showReplayControls !== false,
  showPaperTrade: initial.showPaperTrade !== false,
  shortcutsDialogOpen: false,
  aboutDialogOpen: false,

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

  setDrawingToolbarPos: (pos) => {
    const current = get().drawingToolbarPos
    if (current && current.x === pos.x && current.y === pos.y) return
    set({ drawingToolbarPos: pos })
    persist({ drawingToolbarPos: pos })
  },

  setTradePanelPos: (pos) => {
    const current = get().tradePanelPos
    if (current && current.x === pos.x && current.y === pos.y) return
    set({ tradePanelPos: pos })
    persist({ tradePanelPos: pos })
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
