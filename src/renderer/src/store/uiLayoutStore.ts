import { create } from 'zustand'

const STORAGE_KEY = 'easy-candle:ui-layout'

export type PanelPos = { x: number; y: number }

type PersistedLayout = {
  replayControlsMinimized?: boolean
  replayControlsPos?: PanelPos
  drawingToolbarPos?: PanelPos
  tradePanelPos?: PanelPos
}

type UiLayoutState = {
  chartFullscreen: boolean
  replayControlsMinimized: boolean
  /** null means use default placement (bottom-center) on first layout */
  replayControlsPos: PanelPos | null
  drawingToolbarPos: PanelPos | null
  tradePanelPos: PanelPos | null
  toggleChartFullscreen: () => void
  setChartFullscreen: (value: boolean) => void
  setReplayControlsMinimized: (value: boolean) => void
  setReplayControlsPos: (pos: PanelPos) => void
  setDrawingToolbarPos: (pos: PanelPos) => void
  setTradePanelPos: (pos: PanelPos) => void
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
  return typeof pos.x === 'number' && typeof pos.y === 'number' && Number.isFinite(pos.x) && Number.isFinite(pos.y)
}

const initial = loadPersisted()

export const useUiLayoutStore = create<UiLayoutState>((set, get) => ({
  // Always launch in normal chrome; fullscreen is session-only.
  chartFullscreen: false,
  replayControlsMinimized: Boolean(initial.replayControlsMinimized),
  replayControlsPos: isValidPos(initial.replayControlsPos) ? initial.replayControlsPos : null,
  drawingToolbarPos: isValidPos(initial.drawingToolbarPos) ? initial.drawingToolbarPos : null,
  tradePanelPos: isValidPos(initial.tradePanelPos) ? initial.tradePanelPos : null,

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
