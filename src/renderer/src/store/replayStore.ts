import { create } from 'zustand'
import {
  buildReplayWindowMs,
  fetchCandles,
  fetchCandlesRange,
  prefetchForward,
  PREFETCH_BATCH_SIZE
} from '@/lib/binance'
import { dedupeCandlesByTime, findIndexAtOrBefore, type Candle } from '@shared/candleUtils'
import type { DataSource, ImportedDatasetMeta } from '@shared/importTypes'
import { getIndicator } from '@/lib/indicators'
import {
  closePosition,
  evaluateStopTakeProfit,
  openPosition,
  rewindTradesAfterStepBack,
  summarizeSession,
  withStopLoss,
  withTakeProfit,
  type ClosedTrade,
  type Position,
  type SessionSummary
} from '@/lib/paperTrade'
import { createReplayEngine, type ReplayStatus } from '@/lib/replayEngine'
import { DEFAULT_SYMBOL } from '@shared/symbols'
import { alignTimeToInterval, DEFAULT_TIMEFRAME, TIMEFRAMES } from '@shared/timeframes'

export type ChartStatus = 'idle' | 'loading' | 'ready' | 'error'
export type ViewMode = 'live' | 'replay'
export type ChartSyncKind = 'replace' | 'append'
export type DrawTool = 'select' | 'hline' | 'trendline'
export type { DataSource, ImportedDatasetMeta }

export type ChartSync = {
  kind: ChartSyncKind
  fitContent: boolean
  revision: number
}

export type HLineDrawing = { id: string; type: 'hline'; price: number }
export type TrendDrawing = {
  id: string
  type: 'trendline'
  t1: number
  p1: number
  t2: number
  p2: number
}
export type Drawing = HLineDrawing | TrendDrawing
export type TrendPoint = { time: number; price: number }

export type TradeMarker = {
  time: number
  position: 'aboveBar' | 'belowBar'
  color: string
  shape: 'arrowUp' | 'arrowDown'
  text: string
}

export type SessionReport = {
  symbol: string
  timeframe: string
  trades: ClosedTrade[]
  summary: SessionSummary
  closedOpenOnExit: boolean
}

let drawingSeq = 0
let tradeSeq = 0

function nextDrawingId(): string {
  drawingSeq += 1
  return `d-${drawingSeq}`
}

function nextTradeId(): string {
  tradeSeq += 1
  return `t-${tradeSeq}`
}

const engine = createReplayEngine()

const BASE_TICK_MS = 500

let clockTimer: ReturnType<typeof setInterval> | null = null
let loadGeneration = 0
let replayRequestId = 0
let prefetchInFlight = false

function clearClock(): void {
  if (clockTimer != null) {
    clearInterval(clockTimer)
    clockTimer = null
  }
}

function tickMs(): number {
  const speed = engine.getState().speed || 1
  return Math.max(50, BASE_TICK_MS / speed)
}

function intervalSecondsFor(timeframe: string): number {
  return TIMEFRAMES[timeframe]?.seconds ?? TIMEFRAMES[DEFAULT_TIMEFRAME].seconds
}

function engineSnapshot(): {
  replayStatus: ReplayStatus
  isPlaying: boolean
  speed: number
  replayIndex: number
  visibleCandles: Candle[]
  currentCandle: Candle | null
  bufferLength: number
} {
  const state = engine.getState()
  return {
    replayStatus: state.status,
    isPlaying: state.isPlaying,
    speed: state.speed,
    replayIndex: state.index,
    visibleCandles: engine.getVisibleCandles(),
    currentCandle: engine.getCurrentCandle(),
    bufferLength: state.candles.length
  }
}

type ReplayStore = {
  symbol: string
  timeframe: string
  candles: Candle[]
  status: ChartStatus
  error: string | null
  mode: ViewMode
  dataSource: DataSource
  importMeta: ImportedDatasetMeta | null
  importedCandles: Candle[]
  replayStatus: ReplayStatus
  isPlaying: boolean
  speed: number
  replayIndex: number
  bufferLength: number
  visibleCandles: Candle[]
  currentCandle: Candle | null
  chartSync: ChartSync
  isPrefetching: boolean
  replayLoading: boolean
  replayMessage: string | null
  activeIndicators: string[]
  drawTool: DrawTool
  drawings: Drawing[]
  pendingTrend: TrendPoint | null
  position: Position | null
  closedTrades: ClosedTrade[]
  tradeMarkers: TradeMarker[]
  sessionReport: SessionReport | null
  toggleIndicator: (id: string) => void
  setDrawTool: (tool: DrawTool) => void
  addHorizontalLine: (price: number) => void
  updateHorizontalLine: (id: string, price: number) => void
  addTrendPoint: (point: TrendPoint) => void
  updateTrendLineEndpoint: (
    id: string,
    end: 'start' | 'end',
    point: TrendPoint
  ) => void
  clearDrawings: () => void
  paperBuy: () => void
  paperSell: () => void
  paperClose: () => void
  setTakeProfit: (price: number | null) => void
  setStopLoss: (price: number | null) => void
  dismissSessionReport: () => void
  setSymbol: (symbol: string) => void
  setTimeframe: (timeframe: string) => void
  loadCandles: () => Promise<void>
  activateImportedDataset: (candles: Candle[], meta: ImportedDatasetMeta) => void
  clearImportedDataset: () => void
  startImportedReplay: () => void
  startReplayAt: (startTimeSeconds: number) => Promise<void>
  jumpToTime: (timeSeconds: number) => Promise<void>
  exitReplay: () => void
  play: () => void
  pause: () => void
  stepForward: () => void
  stepBackward: () => void
  setSpeed: (speed: number) => void
  seekToIndex: (index: number) => void
  seekToTime: (timeSeconds: number) => void
}

export const useReplayStore = create<ReplayStore>((set, get) => {
  function publishReplay(kind: ChartSyncKind, opts: { fitContent?: boolean } = {}): void {
    const snap = engineSnapshot()
    const fitContent = opts.fitContent ?? kind === 'replace'
    set((s) => ({
      mode: 'replay',
      candles: engine.getState().candles,
      ...snap,
      chartSync: {
        kind,
        fitContent: kind === 'append' ? false : fitContent,
        revision: s.chartSync.revision + 1
      }
    }))
  }

  /** Close open position if current candle OHLC touches TP/SL (fill at level price). */
  function maybeAutoCloseOnLevels(): void {
    if (get().mode !== 'replay') return
    if (get().replayLoading) return

    const open = get().position
    if (!open) return
    if (open.takeProfit == null && open.stopLoss == null) return

    const candle = engine.getCurrentCandle() || get().currentCandle
    if (!candle) return

    const hit = evaluateStopTakeProfit(open, candle)
    if (!hit) return

    const closed = closePosition(open, hit.price, candle.time, hit.hit)
    set((s) => ({
      position: null,
      closedTrades: [...s.closedTrades, closed],
      replayMessage: null
    }))
  }

  function publishStatus(): void {
    set({
      mode: 'replay',
      candles: engine.getState().candles,
      ...engineSnapshot()
    })
  }

  function stopClock(): void {
    clearClock()
  }

  async function maybePrefetch(): Promise<void> {
    if (prefetchInFlight) return
    if (get().mode !== 'replay') return
    // Imported datasets are fully local — never call Binance.
    if (get().dataSource === 'imported') return
    if (!engine.needsPrefetch()) return

    const buffer = engine.getState().candles
    if (!buffer.length) return

    const last = buffer[buffer.length - 1]
    const { symbol, timeframe } = get()
    const intervalSec = intervalSecondsFor(timeframe)
    const nowSec = Math.floor(Date.now() / 1000)

    if (last.time + intervalSec >= nowSec) return

    prefetchInFlight = true
    set({ isPrefetching: true })

    try {
      const more = await prefetchForward({
        symbol,
        interval: timeframe,
        afterTimeSeconds: last.time,
        limit: PREFETCH_BATCH_SIZE
      })

      if (get().mode !== 'replay') return

      if (more.length > 0) {
        engine.appendCandles(more)
        publishStatus()
      }
    } catch (err) {
      if (get().mode !== 'replay') return
      const message = err instanceof Error ? err.message : 'Prefetch failed'
      set({ replayMessage: message })
    } finally {
      prefetchInFlight = false
      if (get().mode === 'replay') {
        set({ isPrefetching: false })
      }
    }
  }

  function publishImportedPreview(candles: Candle[], meta: ImportedDatasetMeta): void {
    stopClock()
    prefetchInFlight = false
    replayRequestId += 1
    engine.load([])
    set((s) => ({
      dataSource: 'imported',
      importMeta: meta,
      importedCandles: candles,
      symbol: meta.symbol,
      timeframe: meta.timeframe,
      candles,
      status: 'ready',
      error: null,
      mode: 'live',
      replayStatus: 'idle',
      isPlaying: false,
      speed: 1,
      replayIndex: 0,
      visibleCandles: [],
      currentCandle: null,
      bufferLength: 0,
      isPrefetching: false,
      replayLoading: false,
      replayMessage:
        meta.candleCount > 0
          ? `Imported ${meta.symbol} ${meta.timeframe} · ${meta.candleCount.toLocaleString()} candles`
          : null,
      drawTool: 'select',
      drawings: [],
      pendingTrend: null,
      position: null,
      closedTrades: [],
      tradeMarkers: [],
      chartSync: {
        kind: 'replace',
        fitContent: true,
        revision: s.chartSync.revision + 1
      }
    }))
  }

  function startClock(): void {
    stopClock()

    clockTimer = setInterval(() => {
      const { mode, isPlaying } = get()
      if (mode !== 'replay' || !isPlaying) {
        stopClock()
        return
      }

      const before = engine.getState().index
      engine.stepForward()
      const after = engine.getState().index

      if (after > before) {
        publishReplay('append')
        maybeAutoCloseOnLevels()
        void maybePrefetch()
      } else {
        publishReplay('replace', { fitContent: false })
        stopClock()
      }

      if (engine.getState().status === 'ended') {
        stopClock()
      }
    }, tickMs())
  }

  function resetReplayState(opts: { keepImport?: boolean } = {}): void {
    stopClock()
    prefetchInFlight = false
    replayRequestId += 1
    engine.load([])
    set((s) => ({
      mode: 'live',
      replayStatus: 'idle',
      isPlaying: false,
      speed: 1,
      replayIndex: 0,
      visibleCandles: [],
      currentCandle: null,
      bufferLength: 0,
      isPrefetching: false,
      replayLoading: false,
      replayMessage: null,
      drawTool: 'select',
      drawings: [],
      pendingTrend: null,
      position: null,
      closedTrades: [],
      tradeMarkers: [],
      ...(opts.keepImport
        ? {}
        : {
            dataSource: 'binance' as const,
            importMeta: null,
            importedCandles: [] as Candle[]
          }),
      chartSync: {
        kind: 'replace',
        fitContent: true,
        revision: s.chartSync.revision + 1
      }
    }))
  }

  function tryOpen(side: 'long' | 'short'): void {
    if (get().mode !== 'replay') return
    if (get().replayLoading) return
    if (get().replayStatus === 'ended') return

    const candle = engine.getCurrentCandle() || get().currentCandle
    if (!candle) return

    const result = openPosition(get().position, side, candle.close, candle.time, nextTradeId())
    if (!result.ok) {
      set({ replayMessage: result.reason })
      return
    }

    const marker: TradeMarker = {
      time: candle.time,
      position: side === 'long' ? 'belowBar' : 'aboveBar',
      color: side === 'long' ? '#22c55e' : '#ef4444',
      shape: side === 'long' ? 'arrowUp' : 'arrowDown',
      text: side === 'long' ? 'B' : 'S'
    }

    set((s) => ({
      position: result.position,
      tradeMarkers: [...s.tradeMarkers, marker],
      replayMessage: null
    }))
  }

  function tryClose(): void {
    if (get().mode !== 'replay') return
    if (get().replayLoading) return
    if (get().replayStatus === 'ended') return

    const open = get().position
    if (!open) return

    const candle = engine.getCurrentCandle() || get().currentCandle
    if (!candle) return

    const closed = closePosition(open, candle.close, candle.time, 'manual')

    set((s) => ({
      position: null,
      closedTrades: [...s.closedTrades, closed],
      replayMessage: null
    }))
  }

  function setTakeProfit(price: number | null): void {
    if (get().mode !== 'replay') return
    if (get().replayStatus === 'ended') return
    const open = get().position
    if (!open) return

    const result = withTakeProfit(open, price)
    if (!result.ok) {
      set({ replayMessage: result.reason })
      return
    }
    // Do not evaluate TP/SL against the candle that is current while placing —
    // levels only arm for subsequent candle advances.
    set({ position: result.position, replayMessage: null })
  }

  function setStopLoss(price: number | null): void {
    if (get().mode !== 'replay') return
    if (get().replayStatus === 'ended') return
    const open = get().position
    if (!open) return

    const candle = engine.getCurrentCandle() || get().currentCandle
    const markPrice = candle?.close
    const result = withStopLoss(open, price, markPrice)
    if (!result.ok) {
      set({ replayMessage: result.reason })
      return
    }
    // Do not evaluate TP/SL against the candle that is current while placing —
    // levels only arm for subsequent candle advances.
    set({ position: result.position, replayMessage: null })
  }

  async function loadReplayWindow(
    startTimeSeconds: number,
    opts: { clampMessage?: boolean; message?: string | null } = {}
  ): Promise<boolean> {
    const startSec = Math.floor(Number(startTimeSeconds))
    if (!Number.isFinite(startSec)) {
      set({ replayMessage: 'Invalid start time.' })
      return false
    }

    const nowSec = Math.floor(Date.now() / 1000)
    if (startSec >= nowSec) {
      set({
        replayMessage: 'Start time must be in the past (UTC).',
        replayLoading: false
      })
      return false
    }

    const { symbol, timeframe } = get()
    const intervalSec = intervalSecondsFor(timeframe)
    const { startTimeMs, endTimeMs } = buildReplayWindowMs({
      startTimeSeconds: startSec,
      intervalSeconds: intervalSec
    })

    if (startTimeMs >= endTimeMs) {
      set({
        replayMessage: 'Could not build a valid candle window for that time.',
        replayLoading: false
      })
      return false
    }

    const requestId = (replayRequestId += 1)
    const expectedTimeframe = timeframe
    stopClock()
    set({
      replayLoading: true,
      replayMessage: null,
      error: null
    })

    try {
      const candles = await fetchCandlesRange({
        symbol,
        interval: timeframe,
        startTime: startTimeMs,
        endTime: endTimeMs
      })

      if (
        requestId !== replayRequestId ||
        get().symbol !== symbol ||
        get().timeframe !== expectedTimeframe
      ) {
        return false
      }

      if (!candles.length) {
        set({
          replayLoading: false,
          replayMessage: 'No candles found for that UTC range.'
        })
        return false
      }

      const keptSpeed = engine.getState().speed
      engine.load(candles)
      engine.setSpeed(keptSpeed)

      let message = opts.message ?? null
      const firstTime = candles[0].time

      if (startSec < firstTime) {
        engine.seekToIndex(0)
        if (opts.clampMessage !== false) {
          message = message || 'Start was before the first candle — clamped to buffer start.'
        }
      } else {
        engine.seekToTime(startSec)
      }

      set({
        candles,
        status: 'ready',
        replayLoading: false,
        replayMessage: message,
        error: null,
        speed: engine.getState().speed
      })
      // Force a full viewport/price-scale reset whenever a replay window is loaded.
      publishReplay('replace', { fitContent: true })
      void maybePrefetch()
      return true
    } catch (err) {
      if (requestId !== replayRequestId) return false

      const message = err instanceof Error ? err.message : 'Failed to load replay window'
      set({
        replayLoading: false,
        replayMessage: message
      })
      return false
    }
  }

  async function switchReplayTimeframe(nextTimeframe: string): Promise<void> {
    if (!TIMEFRAMES[nextTimeframe]) return
    if (nextTimeframe === get().timeframe) return
    if (get().mode !== 'replay') return
    if (get().dataSource === 'imported') {
      set({
        replayMessage: 'Imported replays are locked to the file timeframe. Import another CSV to change it.'
      })
      return
    }

    const current = engine.getCurrentCandle() || get().currentCandle
    const anchorOpen = current?.time
    if (anchorOpen == null || !Number.isFinite(anchorOpen)) {
      set({
        replayMessage: 'Cannot switch timeframe without a current candle.'
      })
      return
    }

    stopClock()
    engine.pause()
    publishStatus()

    const previousTimeframe = get().timeframe
    const nextIntervalSec = intervalSecondsFor(nextTimeframe)
    const seekTime = alignTimeToInterval(anchorOpen, nextIntervalSec)

    // Keep the open position, session PnL, and drawings. Remap trade markers
    // and trendline endpoints onto the new candle open grid so LWC can resolve
    // their times after the series changes. Position TP/SL stay as absolute prices.
    const remappedMarkers = get().tradeMarkers.map((marker) => ({
      ...marker,
      time: alignTimeToInterval(marker.time, nextIntervalSec)
    }))
    const remappedDrawings = get().drawings.map((drawing) => {
      if (drawing.type === 'hline') return drawing
      return {
        ...drawing,
        t1: alignTimeToInterval(drawing.t1, nextIntervalSec),
        t2: alignTimeToInterval(drawing.t2, nextIntervalSec)
      }
    })
    const pending = get().pendingTrend
    const remappedPending =
      pending == null
        ? null
        : {
            time: alignTimeToInterval(pending.time, nextIntervalSec),
            price: pending.price
          }

    const open = get().position
    const remappedPosition =
      open == null
        ? null
        : {
            ...open,
            entryTime: alignTimeToInterval(open.entryTime, nextIntervalSec)
          }

    const remappedClosed = get().closedTrades.map((trade) => ({
      ...trade,
      entryTime: alignTimeToInterval(trade.entryTime, nextIntervalSec),
      exitTime: alignTimeToInterval(trade.exitTime, nextIntervalSec)
    }))

    set({
      timeframe: nextTimeframe,
      drawings: remappedDrawings,
      pendingTrend: remappedPending,
      tradeMarkers: remappedMarkers,
      position: remappedPosition,
      closedTrades: remappedClosed
    })

    const ok = await loadReplayWindow(seekTime, {
      clampMessage: true,
      message: `Timeframe → ${nextTimeframe} (UTC playhead kept).`
    })

    if (!ok && get().timeframe === nextTimeframe && get().mode === 'replay') {
      set({ timeframe: previousTimeframe })
    }
  }

  return {
    symbol: DEFAULT_SYMBOL.binanceSymbol,
    timeframe: DEFAULT_TIMEFRAME,
    candles: [],
    status: 'idle',
    error: null,
    mode: 'live',
    dataSource: 'binance',
    importMeta: null,
    importedCandles: [],
    replayStatus: 'idle',
    isPlaying: false,
    speed: 1,
    replayIndex: 0,
    bufferLength: 0,
    visibleCandles: [],
    currentCandle: null,
    chartSync: { kind: 'replace', fitContent: true, revision: 0 },
    isPrefetching: false,
    replayLoading: false,
    replayMessage: null,
    activeIndicators: [],
    drawTool: 'select',
    drawings: [],
    pendingTrend: null,
    position: null,
    closedTrades: [],
    tradeMarkers: [],
    sessionReport: null,

    toggleIndicator(id) {
      if (!getIndicator(id)) return
      set((s) => {
        const active = s.activeIndicators.includes(id)
        return {
          activeIndicators: active
            ? s.activeIndicators.filter((item) => item !== id)
            : [...s.activeIndicators, id]
        }
      })
    },

    setDrawTool(tool) {
      if (tool !== 'select' && tool !== 'hline' && tool !== 'trendline') return
      set({ drawTool: tool, pendingTrend: null })
    },

    addHorizontalLine(price) {
      if (get().mode !== 'replay') return
      if (get().replayStatus === 'ended') return
      if (!Number.isFinite(price)) return
      set((s) => ({
        drawTool: 'select',
        drawings: [...s.drawings, { id: nextDrawingId(), type: 'hline', price }]
      }))
    },

    updateHorizontalLine(id, price) {
      if (get().mode !== 'replay') return
      if (get().replayStatus === 'ended') return
      if (!id || !Number.isFinite(price)) return
      set((s) => ({
        drawings: s.drawings.map((d) =>
          d.type === 'hline' && d.id === id ? { ...d, price } : d
        )
      }))
    },

    addTrendPoint(point) {
      if (get().mode !== 'replay') return
      if (get().replayStatus === 'ended') return
      if (!point || !Number.isFinite(point.time) || !Number.isFinite(point.price)) {
        return
      }

      const pending = get().pendingTrend
      if (!pending) {
        set({ pendingTrend: point })
        return
      }

      set((s) => ({
        pendingTrend: null,
        drawTool: 'select',
        drawings: [
          ...s.drawings,
          {
            id: nextDrawingId(),
            type: 'trendline',
            t1: pending.time,
            p1: pending.price,
            t2: point.time,
            p2: point.price
          }
        ]
      }))
    },

    updateTrendLineEndpoint(id, end, point) {
      if (get().mode !== 'replay') return
      if (get().replayStatus === 'ended') return
      if (!id || !point) return
      if (!Number.isFinite(point.time) || !Number.isFinite(point.price)) return
      set((s) => ({
        drawings: s.drawings.map((d) => {
          if (d.type !== 'trendline' || d.id !== id) return d
          return end === 'start'
            ? { ...d, t1: point.time, p1: point.price }
            : { ...d, t2: point.time, p2: point.price }
        })
      }))
    },

    clearDrawings() {
      set({ drawings: [], pendingTrend: null })
    },

    paperBuy() {
      tryOpen('long')
    },

    paperSell() {
      tryOpen('short')
    },

    paperClose() {
      tryClose()
    },

    setTakeProfit(price) {
      setTakeProfit(price)
    },

    setStopLoss(price) {
      setStopLoss(price)
    },

    dismissSessionReport() {
      set({ sessionReport: null })
    },

    setSymbol(symbol) {
      if (symbol === get().symbol) return
      // Replay sessions are locked to the symbol they started on.
      if (get().mode === 'replay') return
      if (get().dataSource === 'imported') return
      resetReplayState()
      set({ symbol })
      void get().loadCandles()
    },

    setTimeframe(timeframe) {
      if (timeframe === get().timeframe) return
      if (!TIMEFRAMES[timeframe]) return
      if (get().dataSource === 'imported' && get().mode !== 'replay') return

      if (get().mode === 'replay') {
        void switchReplayTimeframe(timeframe)
        return
      }

      resetReplayState()
      set({ timeframe, candles: [] })
      void get().loadCandles()
    },

    async loadCandles() {
      const generation = (loadGeneration += 1)

      if (get().dataSource === 'imported') {
        const candles = get().importedCandles
        const meta = get().importMeta
        if (!candles.length || !meta) {
          set({
            candles: [],
            status: 'error',
            error: 'Imported dataset is empty. Import a CSV or return to live Binance data.'
          })
          return
        }

        set({
          candles,
          status: 'ready',
          error: null,
          symbol: meta.symbol,
          timeframe: meta.timeframe,
          replayMessage: `Imported ${meta.symbol} ${meta.timeframe} · ${candles.length.toLocaleString()} candles`
        })
        return
      }

      const { symbol, timeframe } = get()

      set({ status: 'loading', error: null })

      try {
        const candles = await fetchCandles({
          symbol,
          interval: timeframe
        })

        if (generation !== loadGeneration) return

        set({
          candles,
          status: 'ready',
          error: null
        })
      } catch (err) {
        if (generation !== loadGeneration) return

        const message = err instanceof Error ? err.message : 'Failed to load candles'

        set({
          candles: [],
          status: 'error',
          error: message
        })
      }
    },

    activateImportedDataset(candles, meta) {
      const normalized = dedupeCandlesByTime(candles)
      if (!normalized.length) {
        set({ status: 'error', error: 'Imported file has no valid candles.' })
        return
      }
      publishImportedPreview(normalized, meta)
    },

    clearImportedDataset() {
      if (get().mode === 'replay') return
      resetReplayState()
      set({
        symbol: DEFAULT_SYMBOL.binanceSymbol,
        timeframe: DEFAULT_TIMEFRAME,
        candles: []
      })
      void get().loadCandles()
    },

    startImportedReplay() {
      if (get().dataSource !== 'imported') return
      if (get().mode === 'replay') return

      const candles = get().importedCandles
      if (!candles.length) {
        set({ replayMessage: 'No imported candles to replay.' })
        return
      }

      stopClock()
      const keptSpeed = engine.getState().speed
      engine.load(candles)
      engine.setSpeed(keptSpeed)
      // Start on the 5th candle (index 4) so the first bars are visible as context.
      const startIndex = Math.min(4, Math.max(candles.length - 1, 0))
      engine.seekToIndex(startIndex)

      set({
        candles,
        status: 'ready',
        replayLoading: false,
        replayMessage:
          startIndex > 0
            ? `Replay from candle ${startIndex + 1} of imported file.`
            : 'Replay from start of imported file.',
        error: null,
        speed: engine.getState().speed
      })
      publishReplay('replace', { fitContent: true })
    },

    async startReplayAt(startTimeSeconds) {
      if (get().dataSource === 'imported') {
        get().startImportedReplay()
        return
      }
      await loadReplayWindow(startTimeSeconds)
    },

    async jumpToTime(timeSeconds) {
      if (get().mode !== 'replay') return

      const target = Math.floor(Number(timeSeconds))
      if (!Number.isFinite(target)) {
        set({ replayMessage: 'Invalid jump time.' })
        return
      }

      stopClock()
      engine.pause()
      publishStatus()

      const buffer = engine.getState().candles
      if (buffer.length) {
        const first = buffer[0].time
        const last = buffer[buffer.length - 1].time

        if (target >= first && target <= last) {
          const found = findIndexAtOrBefore(buffer, target)
          engine.seekToIndex(found < 0 ? 0 : found)
          set({ replayMessage: null })
          publishReplay('replace', { fitContent: true })
          void maybePrefetch()
          return
        }
      }

      if (get().dataSource === 'imported') {
        set({
          replayMessage: 'Jump time is outside the imported file range.'
        })
        return
      }

      const nowSec = Math.floor(Date.now() / 1000)
      if (target >= nowSec) {
        set({ replayMessage: 'Jump time must be in the past (UTC).' })
        return
      }

      await loadReplayWindow(target)
    },

    exitReplay() {
      const { position, closedTrades, symbol, timeframe, currentCandle, dataSource, importedCandles, importMeta } =
        get()

      let trades = [...closedTrades]
      let closedOpenOnExit = false

      if (position) {
        const candle = engine.getCurrentCandle() || currentCandle
        if (candle) {
          trades = [...trades, closePosition(position, candle.close, candle.time, 'session_exit')]
          closedOpenOnExit = true
        }
      }

      const sessionReport: SessionReport | null =
        trades.length > 0
          ? {
              symbol,
              timeframe,
              trades,
              summary: summarizeSession(trades),
              closedOpenOnExit
            }
          : null

      if (dataSource === 'imported' && importMeta && importedCandles.length) {
        publishImportedPreview(importedCandles, importMeta)
        set({ sessionReport })
        return
      }

      resetReplayState()
      set({ sessionReport })
      void get().loadCandles()
    },

    play() {
      if (get().mode !== 'replay') return
      if (engine.getState().status === 'ended') return
      if (get().replayLoading) return

      engine.play()
      publishStatus()
      startClock()
      void maybePrefetch()
    },

    pause() {
      if (get().mode !== 'replay') return

      engine.pause()
      stopClock()
      publishStatus()
    },

    stepForward() {
      if (get().mode !== 'replay') return
      if (get().replayLoading) return

      stopClock()
      engine.pause()

      const before = engine.getState().index
      engine.stepForward()
      const after = engine.getState().index

      publishReplay(after > before ? 'append' : 'replace', {
        fitContent: false
      })
      if (after > before) {
        maybeAutoCloseOnLevels()
      }
      void maybePrefetch()
    },

    stepBackward() {
      if (get().mode !== 'replay') return
      if (get().replayLoading) return

      stopClock()

      const leftCandle = engine.getCurrentCandle() || get().currentCandle
      const before = engine.getState().index
      engine.stepBackward()
      const after = engine.getState().index

      publishReplay('replace', { fitContent: false })

      if (after < before && leftCandle) {
        const rewound = rewindTradesAfterStepBack({
          position: get().position,
          closedTrades: get().closedTrades,
          leftCandleTime: leftCandle.time,
          currentCandleTime: (engine.getCurrentCandle() || get().currentCandle)?.time ?? leftCandle.time
        })

        const discardSet = new Set(rewound.discardedEntryTimes)
        const tradeMarkers =
          discardSet.size === 0
            ? get().tradeMarkers
            : get().tradeMarkers.filter((marker) => !discardSet.has(marker.time))

        set({
          position: rewound.position,
          closedTrades: rewound.closedTrades,
          tradeMarkers,
          replayMessage: null
        })
      }
    },

    setSpeed(speed) {
      engine.setSpeed(speed)
      const next = engine.getState().speed
      const { mode, isPlaying } = get()
      set({ speed: next })

      if (mode === 'replay' && isPlaying) {
        engine.play()
        startClock()
      }
    },

    seekToIndex(index) {
      if (get().mode !== 'replay') return
      stopClock()
      engine.seekToIndex(index)
      publishReplay('replace', { fitContent: false })
    },

    seekToTime(timeSeconds) {
      if (get().mode !== 'replay') return
      stopClock()
      engine.seekToTime(timeSeconds)
      publishReplay('replace', { fitContent: false })
    }
  }
})
