import { create } from 'zustand'
import type { Drawing, FibLevelConfig } from '@/lib/chart/drawingGeometry'
import type {
  ClosedTrade,
  HistoricOrder,
  PendingOrder,
  PendingOrderKind,
  Position
} from '@/lib/paperTrade'
import { useReplayStore, type TradeMarker, type ViewMode } from '@/store/replayStore'

const STORAGE_KEY = 'easy-candle:sessions'

export const SESSION_NAME_MAX_LENGTH = 48

/** Debounce between a chart change and the auto-save write. */
const AUTO_SAVE_DEBOUNCE_MS = 800

/**
 * A named, persisted bundle of the chart state: the drawings on the chart,
 * every paper-trade order (open position, pending limit or stop-limit, closed trades,
 * and order history including canceled pendings),
 * and the replay position — captured together. With `autoSave` enabled the
 * bundle follows live edits, so the replay playhead is kept up to date while
 * the app is closed and can be resumed later from the same spot.
 */
export type Session = {
  id: string
  name: string
  symbol: string
  timeframe: string
  createdAt: number
  updatedAt: number
  /** When true, chart drawing/order edits are written back automatically. */
  autoSave: boolean
  drawings: Drawing[]
  positions: Position[]
  pendingOrders: PendingOrder[]
  closedTrades: ClosedTrade[]
  orderHistory: HistoricOrder[]
  tradeMarkers: TradeMarker[]
  /** Live vs replay — the mode the chart was in when captured. */
  mode: ViewMode
  /** Playhead candle open time (unix seconds); null when not in replay. */
  replayTime: number | null
  speed: number
  dataSource: 'binance' | 'imported' | 'mtbridge'
  /** Imported dataset id to reload when resuming an imported replay. */
  importId: string | null
}

type SessionSnapshot = Pick<
  Session,
  | 'symbol'
  | 'timeframe'
  | 'drawings'
  | 'positions'
  | 'pendingOrders'
  | 'closedTrades'
  | 'orderHistory'
  | 'tradeMarkers'
  | 'mode'
  | 'replayTime'
  | 'speed'
  | 'dataSource'
  | 'importId'
>

type SessionStoreState = {
  sessions: Session[]
  /** The session currently receiving auto-saves; null when none is active. */
  activeSessionId: string | null
  /**
   * Session id waiting on the "you will lose your work" confirmation. Set by
   * `requestLoadSession`; cleared by `confirmPendingLoad` / `cancelPendingLoad`.
   */
  pendingLoadId: string | null
  /**
   * Session id waiting on the delete confirmation. Set by `requestDeleteSession`;
   * cleared by `confirmPendingDelete` / `cancelPendingDelete`.
   */
  pendingDeleteId: string | null
  createSession: (name: string) => string | null
  renameSession: (id: string, name: string) => void
  deleteSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  /**
   * Close the active session: save it one last time, then clear the chart back
   * to a blank live view — drawings and orders removed, replay exited, and no
   * session report shown.
   */
  exitActiveSession: () => void
  /**
   * Load a session, but ask first when unsaved chart work would be discarded.
   * Returns 'confirm' when a dialog is now pending, otherwise the load result.
   */
  requestLoadSession: (id: string) => Promise<boolean | 'confirm'>
  /** Load the session held by `pendingLoadId`. */
  confirmPendingLoad: () => Promise<boolean>
  cancelPendingLoad: () => void
  /** Ask before deleting, since a session cannot be recovered. */
  requestDeleteSession: (id: string) => void
  /** Delete the session held by `pendingDeleteId`. */
  confirmPendingDelete: () => void
  cancelPendingDelete: () => void
  /** Restore a session's drawings, orders, and replay position onto the chart. */
  loadSession: (id: string) => Promise<boolean>
  /** Write the current chart drawings/orders into the active session. */
  saveActiveSession: () => boolean
  setSessionAutoSave: (id: string, enabled: boolean) => void
}

function cloneJson<T>(value: T): T {
  return value == null ? value : (JSON.parse(JSON.stringify(value)) as T)
}

/** Capture the current chart drawings, orders, and replay position. */
function chartSnapshot(): SessionSnapshot {
  const state = useReplayStore.getState()
  return {
    symbol: state.symbol,
    timeframe: state.timeframe,
    drawings: cloneJson(state.drawings),
    positions: cloneJson(state.positions),
    pendingOrders: cloneJson(state.pendingOrders),
    closedTrades: cloneJson(state.closedTrades),
    orderHistory: cloneJson(state.orderHistory),
    tradeMarkers: cloneJson(state.tradeMarkers),
    mode: state.mode,
    replayTime: state.mode === 'replay' && state.currentCandle ? state.currentCandle.time : null,
    speed: state.speed,
    dataSource: state.dataSource,
    importId: state.importMeta?.id ?? null
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Chart state a session load would overwrite. */
export type UnsavedChartWork = {
  drawings: number
  trades: number
  inReplay: boolean
}

/**
 * What a session load is about to discard. Only meaningful when no session is
 * active — with one active the work is already saved into it.
 */
export function describeUnsavedWork(state: {
  drawings: unknown[]
  positions: unknown[]
  pendingOrders: unknown[]
  closedTrades: unknown[]
  orderHistory: unknown[]
  mode: ViewMode
}): UnsavedChartWork | null {
  const drawings = state.drawings.length
  const trades =
    state.positions.length +
    state.pendingOrders.length +
    state.closedTrades.length +
    state.orderHistory.length
  const inReplay = state.mode === 'replay'

  if (drawings === 0 && trades === 0 && !inReplay) return null
  return { drawings, trades, inReplay }
}

function sanitizeStyle(raw: unknown): Drawing['style'] {
  if (!raw || typeof raw !== 'object') return undefined
  const rec = raw as Record<string, unknown>
  const style: Partial<NonNullable<Drawing['style']>> = {}
  if (typeof rec.color === 'string' && rec.color.length > 0) style.color = rec.color
  if (isFiniteNumber(rec.lineWidth)) style.lineWidth = rec.lineWidth
  if (typeof rec.lineStyle === 'number') {
    style.lineStyle = rec.lineStyle as NonNullable<Drawing['style']>['lineStyle']
  }
  if (typeof rec.fillColor === 'string' && rec.fillColor.length > 0) style.fillColor = rec.fillColor
  if (typeof rec.tpColor === 'string' && rec.tpColor.length > 0) style.tpColor = rec.tpColor
  if (typeof rec.slColor === 'string' && rec.slColor.length > 0) style.slColor = rec.slColor
  return Object.keys(style).length > 0 ? (style as Drawing['style']) : undefined
}

function sanitizeFibLevels(raw: unknown): FibLevelConfig[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const levels: FibLevelConfig[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    if (!isFiniteNumber(rec.ratio)) continue
    const level: FibLevelConfig = { ratio: rec.ratio }
    if (typeof rec.color === 'string' && rec.color.length > 0) level.color = rec.color
    if (typeof rec.lineStyle === 'number') {
      level.lineStyle = rec.lineStyle as FibLevelConfig['lineStyle']
    }
    levels.push(level)
  }
  return levels.length > 0 ? levels : undefined
}

function sanitizeDrawing(raw: unknown): Drawing | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  if (typeof rec.id !== 'string' || rec.id.length === 0) return null
  const style = sanitizeStyle(rec.style)

  switch (rec.type) {
    case 'hline': {
      if (!isFiniteNumber(rec.price)) return null
      return { id: rec.id, type: 'hline', price: rec.price, ...(style ? { style } : {}) }
    }
    case 'trendline':
    case 'rect': {
      if (
        !isFiniteNumber(rec.t1) ||
        !isFiniteNumber(rec.p1) ||
        !isFiniteNumber(rec.t2) ||
        !isFiniteNumber(rec.p2)
      ) {
        return null
      }
      return {
        id: rec.id,
        type: rec.type,
        t1: rec.t1,
        p1: rec.p1,
        t2: rec.t2,
        p2: rec.p2,
        ...(style ? { style } : {})
      }
    }
    case 'fib': {
      if (
        !isFiniteNumber(rec.t1) ||
        !isFiniteNumber(rec.p1) ||
        !isFiniteNumber(rec.t2) ||
        !isFiniteNumber(rec.p2)
      ) {
        return null
      }
      const levels = sanitizeFibLevels(rec.levels)
      return {
        id: rec.id,
        type: 'fib',
        t1: rec.t1,
        p1: rec.p1,
        t2: rec.t2,
        p2: rec.p2,
        ...(style ? { style } : {}),
        ...(levels ? { levels } : {})
      }
    }
    case 'fibchannel': {
      if (
        !isFiniteNumber(rec.t1) ||
        !isFiniteNumber(rec.p1) ||
        !isFiniteNumber(rec.t2) ||
        !isFiniteNumber(rec.p2) ||
        !isFiniteNumber(rec.t3) ||
        !isFiniteNumber(rec.p3)
      ) {
        return null
      }
      const levels = sanitizeFibLevels(rec.levels)
      return {
        id: rec.id,
        type: 'fibchannel',
        t1: rec.t1,
        p1: rec.p1,
        t2: rec.t2,
        p2: rec.p2,
        t3: rec.t3,
        p3: rec.p3,
        ...(style ? { style } : {}),
        ...(levels ? { levels } : {})
      }
    }
    case 'long':
    case 'short': {
      if (!isFiniteNumber(rec.t) || !isFiniteNumber(rec.entry)) return null
      return {
        id: rec.id,
        type: rec.type,
        t: rec.t,
        entry: rec.entry,
        target: isFiniteNumber(rec.target) ? rec.target : null,
        stop: isFiniteNumber(rec.stop) ? rec.stop : null,
        span: isFiniteNumber(rec.span) ? rec.span : 6,
        ...(style ? { style } : {})
      }
    }
    default:
      return null
  }
}

function sanitizeSide(raw: unknown): 'long' | 'short' | null {
  return raw === 'long' || raw === 'short' ? raw : null
}

function sanitizePendingKind(raw: unknown): PendingOrderKind | undefined {
  return raw === 'stopLimit' || raw === 'limit' ? raw : undefined
}

function sanitizePositionList(raw: unknown, legacy: unknown): Position[] {
  const out: Position[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const position = sanitizePosition(item)
      if (position) out.push(position)
    }
    return out
  }
  const one = sanitizePosition(legacy)
  return one ? [one] : []
}

function sanitizePendingOrderList(raw: unknown, legacy: unknown): PendingOrder[] {
  const out: PendingOrder[] = []
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const pending = sanitizePendingOrder(item)
      if (pending) out.push(pending)
    }
    return out
  }
  const one = sanitizePendingOrder(legacy)
  return one ? [one] : []
}

function sanitizePosition(raw: unknown): Position | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const side = sanitizeSide(rec.side)
  if (typeof rec.id !== 'string' || rec.id.length === 0 || side == null) return null
  if (
    !isFiniteNumber(rec.entryPrice) ||
    !isFiniteNumber(rec.entryTime) ||
    !isFiniteNumber(rec.lots)
  ) {
    return null
  }
  return {
    id: rec.id,
    side,
    entryPrice: rec.entryPrice,
    entryTime: rec.entryTime,
    lots: rec.lots,
    takeProfit: isFiniteNumber(rec.takeProfit) ? rec.takeProfit : null,
    stopLoss: isFiniteNumber(rec.stopLoss) ? rec.stopLoss : null,
    ...(isFiniteNumber(rec.pendingPlacedTime)
      ? { pendingPlacedTime: rec.pendingPlacedTime as number }
      : {}),
    ...(sanitizePendingKind(rec.pendingKind)
      ? { pendingKind: sanitizePendingKind(rec.pendingKind) }
      : {})
  }
}

function sanitizePendingOrder(raw: unknown): PendingOrder | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const side = sanitizeSide(rec.side)
  if (typeof rec.id !== 'string' || rec.id.length === 0 || side == null) return null
  if (!isFiniteNumber(rec.price) || !isFiniteNumber(rec.placedTime) || !isFiniteNumber(rec.lots)) {
    return null
  }
  return {
    id: rec.id,
    side,
    kind: sanitizePendingKind(rec.kind) ?? 'limit',
    price: rec.price,
    placedTime: rec.placedTime,
    lots: rec.lots,
    takeProfit: isFiniteNumber(rec.takeProfit) ? rec.takeProfit : null,
    stopLoss: isFiniteNumber(rec.stopLoss) ? rec.stopLoss : null
  }
}

const EXIT_REASONS = ['manual', 'tp', 'sl', 'session_exit'] as const
const ORDER_TYPES = ['market', 'limit', 'stopLimit'] as const
const ORDER_STATUSES = ['filled', 'canceled'] as const

function sanitizeClosedTrade(raw: unknown): ClosedTrade | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const side = sanitizeSide(rec.side)
  const reason = EXIT_REASONS.find((item) => item === rec.exitReason)
  if (typeof rec.id !== 'string' || rec.id.length === 0 || side == null || reason == null) {
    return null
  }
  if (
    !isFiniteNumber(rec.entryPrice) ||
    !isFiniteNumber(rec.entryTime) ||
    !isFiniteNumber(rec.exitPrice) ||
    !isFiniteNumber(rec.exitTime) ||
    !isFiniteNumber(rec.lots) ||
    !isFiniteNumber(rec.pnl)
  ) {
    return null
  }
  return {
    id: rec.id,
    side,
    entryPrice: rec.entryPrice,
    entryTime: rec.entryTime,
    exitPrice: rec.exitPrice,
    exitTime: rec.exitTime,
    lots: rec.lots,
    pnl: rec.pnl,
    exitReason: reason,
    takeProfit: isFiniteNumber(rec.takeProfit) ? rec.takeProfit : null,
    stopLoss: isFiniteNumber(rec.stopLoss) ? rec.stopLoss : null,
    ...(isFiniteNumber(rec.pendingPlacedTime)
      ? { pendingPlacedTime: rec.pendingPlacedTime as number }
      : {}),
    ...(sanitizePendingKind(rec.pendingKind)
      ? { pendingKind: sanitizePendingKind(rec.pendingKind) }
      : {})
  }
}

function sanitizeHistoricOrder(raw: unknown): HistoricOrder | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const side = sanitizeSide(rec.side)
  const type = ORDER_TYPES.find((item) => item === rec.type)
  const status = ORDER_STATUSES.find((item) => item === rec.status)
  if (
    typeof rec.id !== 'string' ||
    rec.id.length === 0 ||
    side == null ||
    type == null ||
    status == null
  ) {
    return null
  }
  if (
    !isFiniteNumber(rec.price) ||
    !isFiniteNumber(rec.lots) ||
    !isFiniteNumber(rec.placedTime) ||
    !isFiniteNumber(rec.updateTime)
  ) {
    return null
  }
  return {
    id: rec.id,
    side,
    type,
    status,
    price: rec.price,
    lots: rec.lots,
    placedTime: rec.placedTime,
    updateTime: rec.updateTime,
    takeProfit: isFiniteNumber(rec.takeProfit) ? rec.takeProfit : null,
    stopLoss: isFiniteNumber(rec.stopLoss) ? rec.stopLoss : null
  }
}

function sanitizeTradeMarker(raw: unknown): TradeMarker | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  if (
    !isFiniteNumber(rec.time) ||
    (rec.position !== 'aboveBar' && rec.position !== 'belowBar') ||
    typeof rec.color !== 'string' ||
    (rec.shape !== 'arrowUp' && rec.shape !== 'arrowDown') ||
    typeof rec.text !== 'string'
  ) {
    return null
  }
  return {
    time: rec.time,
    position: rec.position,
    color: rec.color,
    shape: rec.shape,
    text: rec.text
  }
}

function sanitizeSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const name = typeof rec.name === 'string' ? rec.name.trim().slice(0, SESSION_NAME_MAX_LENGTH) : ''
  if (!name) return null
  const id = typeof rec.id === 'string' && rec.id.length > 0 ? rec.id : crypto.randomUUID()
  const createdAt = isFiniteNumber(rec.createdAt) ? rec.createdAt : Date.now()
  const updatedAt = isFiniteNumber(rec.updatedAt) ? rec.updatedAt : createdAt

  const drawings: Drawing[] = []
  if (Array.isArray(rec.drawings)) {
    for (const item of rec.drawings) {
      const drawing = sanitizeDrawing(item)
      if (drawing) drawings.push(drawing)
    }
  }

  const closedTrades: ClosedTrade[] = []
  if (Array.isArray(rec.closedTrades)) {
    for (const item of rec.closedTrades) {
      const trade = sanitizeClosedTrade(item)
      if (trade) closedTrades.push(trade)
    }
  }

  const orderHistory: HistoricOrder[] = []
  if (Array.isArray(rec.orderHistory)) {
    for (const item of rec.orderHistory) {
      const order = sanitizeHistoricOrder(item)
      if (order) orderHistory.push(order)
    }
  }

  const tradeMarkers: TradeMarker[] = []
  if (Array.isArray(rec.tradeMarkers)) {
    for (const item of rec.tradeMarkers) {
      const marker = sanitizeTradeMarker(item)
      if (marker) tradeMarkers.push(marker)
    }
  }

  return {
    id,
    name,
    symbol: typeof rec.symbol === 'string' ? rec.symbol : '',
    timeframe: typeof rec.timeframe === 'string' ? rec.timeframe : '',
    createdAt,
    updatedAt,
    autoSave: rec.autoSave !== false,
    drawings,
    positions: sanitizePositionList(rec.positions, rec.position),
    pendingOrders: sanitizePendingOrderList(rec.pendingOrders, rec.pendingOrder),
    closedTrades,
    orderHistory,
    tradeMarkers,
    mode: rec.mode === 'replay' ? 'replay' : 'live',
    replayTime: isFiniteNumber(rec.replayTime) ? rec.replayTime : null,
    speed: isFiniteNumber(rec.speed) ? Math.min(1000, Math.max(0.1, rec.speed)) : 1,
    dataSource:
      rec.dataSource === 'imported'
        ? 'imported'
        : rec.dataSource === 'mtbridge'
          ? 'mtbridge'
          : 'binance',
    importId: typeof rec.importId === 'string' && rec.importId.length > 0 ? rec.importId : null
  }
}

function loadPersisted(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return []
    const rec = parsed as Record<string, unknown>
    if (!Array.isArray(rec.sessions)) return []
    const sessions: Session[] = []
    const seen = new Set<string>()
    for (const item of rec.sessions) {
      const session = sanitizeSession(item)
      if (!session || seen.has(session.id)) continue
      seen.add(session.id)
      sessions.push(session)
    }
    return sessions
  } catch {
    return []
  }
}

function persistLive(): void {
  try {
    const { sessions } = useSessionStore.getState()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions }))
  } catch {
    // ignore quota / private mode
  }
}

/** Merge a fresh chart snapshot into an existing session and persist it. */
function updateSessionSnapshot(id: string, snap: SessionSnapshot): boolean {
  const state = useSessionStore.getState()
  const exists = state.sessions.some((session) => session.id === id)
  if (!exists) return false
  useSessionStore.setState((current) => ({
    sessions: current.sessions.map((session) =>
      session.id === id ? { ...session, ...snap, updatedAt: Date.now() } : session
    )
  }))
  persistLive()
  return true
}

const initialSessions = loadPersisted()

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessions: initialSessions,
  activeSessionId: null,
  pendingLoadId: null,
  pendingDeleteId: null,

  createSession(name) {
    const trimmed = name.trim().slice(0, SESSION_NAME_MAX_LENGTH)
    if (!trimmed) return null
    const session: Session = {
      id: crypto.randomUUID(),
      name: trimmed,
      autoSave: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...chartSnapshot()
    }
    set((state) => ({ sessions: [...state.sessions, session], activeSessionId: session.id }))
    persistLive()
    return session.id
  },

  renameSession(id, name) {
    const trimmed = name.trim().slice(0, SESSION_NAME_MAX_LENGTH)
    if (!trimmed) return
    const sessions = get().sessions.map((session) =>
      session.id === id ? { ...session, name: trimmed, updatedAt: Date.now() } : session
    )
    set({ sessions })
    persistLive()
  },

  deleteSession(id) {
    const sessions = get().sessions.filter((session) => session.id !== id)
    if (sessions.length === get().sessions.length) return
    set((state) => ({
      sessions,
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      pendingLoadId: state.pendingLoadId === id ? null : state.pendingLoadId,
      pendingDeleteId: state.pendingDeleteId === id ? null : state.pendingDeleteId
    }))
    persistLive()
  },

  requestDeleteSession(id) {
    if (!get().sessions.some((session) => session.id === id)) return
    set({ pendingDeleteId: id })
  },

  confirmPendingDelete() {
    const id = get().pendingDeleteId
    if (id == null) return
    // deleteSession clears pendingDeleteId as part of the same update.
    get().deleteSession(id)
    if (get().pendingDeleteId === id) set({ pendingDeleteId: null })
  },

  cancelPendingDelete() {
    if (get().pendingDeleteId == null) return
    set({ pendingDeleteId: null })
  },

  setActiveSession(id) {
    if (get().activeSessionId === id) return
    set({ activeSessionId: id })
  },

  exitActiveSession() {
    const activeId = get().activeSessionId
    if (activeId == null) return

    // Persist the final state before detaching, so reopening resumes here.
    const active = get().sessions.find((session) => session.id === activeId)
    if (active?.autoSave) updateSessionSnapshot(activeId, chartSnapshot())

    // Detach first so the teardown below is not written back into the session.
    suppressAutoSave += 1
    try {
      set({ activeSessionId: null })

      const replay = useReplayStore.getState()
      if (replay.mode === 'replay') {
        // resetReplayState already wipes drawings and trades; skip the report.
        replay.exitReplay({ report: false })
      } else {
        replay.clearDrawings()
        useReplayStore.setState({
          positions: [],
          pendingOrders: [],
          selectedWorkingId: null,
          closedTrades: [],
          orderHistory: [],
          tradeMarkers: [],
          sessionReport: null
        })
      }
    } finally {
      suppressAutoSave -= 1
    }
  },

  async requestLoadSession(id) {
    if (!get().sessions.some((session) => session.id === id)) return false
    if (id === get().activeSessionId) return true

    // With a session active its work is already saved into it, so only an
    // unattached chart can lose anything.
    if (get().activeSessionId == null && describeUnsavedWork(useReplayStore.getState())) {
      set({ pendingLoadId: id })
      return 'confirm'
    }

    return get().loadSession(id)
  },

  async confirmPendingLoad() {
    const id = get().pendingLoadId
    if (id == null) return false
    set({ pendingLoadId: null })
    return get().loadSession(id)
  },

  cancelPendingLoad() {
    if (get().pendingLoadId == null) return
    set({ pendingLoadId: null })
  },

  async loadSession(id) {
    const session = get().sessions.find((item) => item.id === id)
    if (!session) return false
    suppressAutoSave += 1
    try {
      const replay = useReplayStore.getState()
      const shouldResume = session.mode === 'replay' && session.replayTime != null
      const replayTime = session.replayTime

      if (shouldResume && replayTime != null) {
        if (replay.mode === 'replay') {
          useReplayStore.getState().resetReplayState()
        }
        if (session.dataSource === 'imported') {
          if (
            replay.importMeta?.id !== session.importId ||
            replay.timeframe !== session.timeframe
          ) {
            await useReplayStore
              .getState()
              .selectImportedDataset(session.importId ?? '', session.timeframe)
          }
          // Imported series load in windows, so resume by time instead of index.
          await useReplayStore.getState().startImportedReplayAtTime(replayTime)
        } else {
          if (replay.symbol !== session.symbol || replay.timeframe !== session.timeframe) {
            useReplayStore.setState({
              symbol: session.symbol,
              timeframe: session.timeframe,
              dataSource: 'binance'
            })
            await useReplayStore.getState().loadCandles()
          }
          await useReplayStore.getState().startReplayAt(replayTime)
        }
        useReplayStore.getState().setSpeed(session.speed)
      } else if (replay.mode === 'replay') {
        // A live-mode session must not inherit the replay we were sitting in.
        useReplayStore.getState().exitReplay({ report: false })
      }

      // Restore drawings and orders after the replay is positioned so the
      // entering-replay reset does not wipe them.
      useReplayStore.setState({
        drawings: cloneJson(session.drawings),
        drawTool: 'select',
        pendingTrend: null,
        pendingTrendEnd: null,
        selectedDrawingId: null,
        positions: cloneJson(session.positions),
        pendingOrders: cloneJson(session.pendingOrders),
        selectedWorkingId: null,
        closedTrades: cloneJson(session.closedTrades),
        orderHistory: cloneJson(session.orderHistory ?? []),
        tradeMarkers: cloneJson(session.tradeMarkers)
      })
      set({ activeSessionId: id })
      return true
    } finally {
      suppressAutoSave -= 1
    }
  },

  saveActiveSession() {
    const activeId = get().activeSessionId
    if (activeId == null) return false
    return updateSessionSnapshot(activeId, chartSnapshot())
  },

  setSessionAutoSave(id, enabled) {
    const sessions = get().sessions.map((session) =>
      session.id === id ? { ...session, autoSave: enabled } : session
    )
    set({ sessions })
    persistLive()
  }
}))

/** Set >0 while `loadSession` is writing to the replay store to skip auto-saves. */
let suppressAutoSave = 0
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleAutoSave(): void {
  if (suppressAutoSave > 0) return
  const state = useSessionStore.getState()
  if (state.activeSessionId == null) return
  const active = state.sessions.find((session) => session.id === state.activeSessionId)
  if (!active || !active.autoSave) return
  const captured = suppressAutoSave
  if (autoSaveTimer != null) globalThis.clearTimeout(autoSaveTimer)
  autoSaveTimer = globalThis.setTimeout(() => {
    autoSaveTimer = null
    if (suppressAutoSave !== captured) return
    const current = useSessionStore.getState()
    if (current.activeSessionId == null) return
    updateSessionSnapshot(current.activeSessionId, chartSnapshot())
  }, AUTO_SAVE_DEBOUNCE_MS)
}

/** Follow drawing/order edits so an auto-saving session stays in sync. */
useReplayStore.subscribe((state, prev) => {
  if (
    state.drawings !== prev.drawings ||
    state.positions !== prev.positions ||
    state.pendingOrders !== prev.pendingOrders ||
    state.closedTrades !== prev.closedTrades ||
    state.orderHistory !== prev.orderHistory ||
    state.tradeMarkers !== prev.tradeMarkers ||
    state.symbol !== prev.symbol ||
    state.timeframe !== prev.timeframe
  ) {
    scheduleAutoSave()
  }
})
