import { create } from 'zustand'
import {
  buildReplayWindowMs,
  fetchCandles,
  fetchCandlesRange,
  prefetchForward,
  PREFETCH_BATCH_SIZE
} from '@/lib/binance'
import { aggregateCandles } from '@shared/candleAggregate'
import { dedupeCandlesByTime, findIndexAtOrBefore, type Candle } from '@shared/candleUtils'
import {
  isBinanceDataSource,
  isMetatraderImport,
  type DataSource,
  type ImportedDatasetMeta
} from '@shared/importTypes'
import {
  DEFAULT_MT_BRIDGE_STATUS,
  type MtBridgeConnectionStatus,
  type MtBridgeIpcEvent,
  type MtPreviewSummary
} from '@shared/mtBridgeTypes'
import { getIndicator } from '@/lib/indicators'
import {
  clampRiskReward,
  clampTradeSizeForSymbol,
  closePosition,
  DEFAULT_LOTS,
  DEFAULT_RISK_REWARD,
  evaluatePendingFill,
  evaluateStopTakeProfit,
  openPosition,
  pendingToPosition,
  placePendingLimit,
  pnlScaleForSymbol,
  rewindTradesAfterStepBack,
  stopLossFromTakeProfit,
  summarizeSession,
  takeProfitFromStopLoss,
  ticketEntryPrice,
  linkedTicketOpposite,
  withPendingPrice,
  withPendingStopLoss,
  withPendingTakeProfit,
  withStopLoss,
  withTakeProfit,
  type ClosedTrade,
  type PendingOrder,
  type Position,
  type PnlScale,
  type SessionSummary,
  type TicketOrderType,
  type TicketDraftLevels
} from '@/lib/paperTrade'

export type LevelSetOptions = {
  /**
   * Guide only: when placing the first level, fill the missing opposite at the
   * configured R:R. Never used for later manual moves.
   */
  linkRr?: boolean
}

/** Pick a TP/SL/limit price from the chart (order-ticket crosshair handle). */
export type PricePickKind = 'tp' | 'sl' | 'limit'

const EMPTY_TICKET_LEVELS: {
  ticketTakeProfit: number | null
  ticketStopLoss: number | null
  ticketLimitPrice: number | null
  pricePick: PricePickKind | null
} = {
  ticketTakeProfit: null,
  ticketStopLoss: null,
  ticketLimitPrice: null,
  pricePick: null
}

import { createReplayEngine, type ReplayStatus } from '@/lib/replayEngine'
import { isChartType, type ChartType } from '@/lib/chart/chartTypes'
import {
  cloneDrawing as cloneDrawingGeom,
  drawingToolType,
  isDrawTool,
  isPositionDrawing,
  isPositionTool,
  isTwoPointTool,
  isValidPositionLevel,
  POSITION_SPAN_DEFAULT,
  POSITION_SPAN_MAX,
  POSITION_SPAN_MIN,
  remapDrawingTimes,
  translateDrawing,
  updateRectHandle as updateRectHandleGeom,
  updateTwoPointEndpoint as updateTwoPointEndpointGeom,
  type Drawing,
  type DrawingStyle,
  type DrawTool,
  type Endpoint,
  type FibLevelConfig,
  type PositionDrawing,
  type PositionLevel,
  type RectHandle,
  type TrendPoint
} from '@/lib/chart/drawingGeometry'
import { defaultFibLevelsForTool, defaultStyleForTool } from '@/store/drawingSettingsStore'
import { DEFAULT_SYMBOL } from '@shared/symbols'
import {
  alignTimeToInterval,
  DEFAULT_TIMEFRAME,
  defaultSecondaryTimeframe,
  playheadCoverEnd,
  TIMEFRAMES
} from '@shared/timeframes'

const PAUSE_ON_TP_SL_KEY = 'easy-candle:pause-on-tp-sl'

function loadPauseOnTpSl(): boolean {
  try {
    return localStorage.getItem(PAUSE_ON_TP_SL_KEY) === '1'
  } catch {
    return false
  }
}

function persistPauseOnTpSl(value: boolean): void {
  try {
    localStorage.setItem(PAUSE_ON_TP_SL_KEY, value ? '1' : '0')
  } catch {
    // ignore quota / private mode
  }
}

export type ChartStatus = 'idle' | 'loading' | 'ready' | 'error'
export type ViewMode = 'live' | 'replay'
export type ChartSyncKind = 'replace' | 'append'
export type DriverPane = 'primary' | 'secondary'
export type { DataSource, ImportedDatasetMeta, MtBridgeConnectionStatus }
export type {
  Drawing,
  DrawTool,
  Endpoint,
  FibDrawing,
  FibLevelConfig,
  HLineDrawing,
  PositionDrawing,
  PositionLevel,
  RectDrawing,
  RectHandle,
  TrendDrawing,
  TrendPoint
} from '@/lib/chart/drawingGeometry'

export type ChartSync = {
  kind: ChartSyncKind
  fitContent: boolean
  revision: number
}

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

function emptyDrawingState(): {
  drawTool: DrawTool
  drawings: Drawing[]
  pendingTrend: null
  selectedDrawingId: null
} {
  return {
    drawTool: 'select',
    drawings: [],
    pendingTrend: null,
    selectedDrawingId: null
  }
}

function remapDrawingsToInterval(drawings: Drawing[], intervalSec: number): Drawing[] {
  return drawings.map((drawing) => remapDrawingTimes(drawing, intervalSec))
}

function remapPendingTrendToInterval(
  pending: TrendPoint | null,
  intervalSec: number
): TrendPoint | null {
  if (pending == null) return null
  return {
    time: alignTimeToInterval(pending.time, intervalSec),
    price: pending.price
  }
}

function remapPendingOrderToInterval(
  pending: PendingOrder | null,
  intervalSec: number
): PendingOrder | null {
  if (pending == null) return null
  return {
    ...pending,
    placedTime: alignTimeToInterval(pending.placedTime, intervalSec)
  }
}

function remapPositionTimes(open: Position | null, intervalSec: number): Position | null {
  if (open == null) return null
  return {
    ...open,
    entryTime: alignTimeToInterval(open.entryTime, intervalSec),
    pendingPlacedTime:
      open.pendingPlacedTime != null
        ? alignTimeToInterval(open.pendingPlacedTime, intervalSec)
        : open.pendingPlacedTime
  }
}

const engine = createReplayEngine()
const secondaryEngine = createReplayEngine()

const BASE_TICK_MS = 500

let clockTimer: ReturnType<typeof setInterval> | null = null
let loadGeneration = 0
let replayRequestId = 0
let secondaryLoadGeneration = 0
let prefetchInFlight = false
let secondaryPrefetchInFlight = false

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

function displayedFromSource(source1m: Candle[], timeframe: string): Candle[] {
  if (!source1m.length) return []
  if (timeframe === '1m') return source1m
  return aggregateCandles(source1m, intervalSecondsFor(timeframe))
}

function emptySecondaryPaneState(): {
  secondaryCandles: Candle[]
  secondaryVisibleCandles: Candle[]
  secondaryCurrentCandle: Candle | null
  secondaryReplayIndex: number
  secondaryBufferLength: number
  secondaryStatus: ChartStatus
  secondaryError: string | null
  secondaryLoading: boolean
} {
  return {
    secondaryCandles: [],
    secondaryVisibleCandles: [],
    secondaryCurrentCandle: null,
    secondaryReplayIndex: 0,
    secondaryBufferLength: 0,
    secondaryStatus: 'idle',
    secondaryError: null,
    secondaryLoading: false
  }
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

function secondarySnapshot(): {
  secondaryCandles: Candle[]
  secondaryVisibleCandles: Candle[]
  secondaryCurrentCandle: Candle | null
  secondaryReplayIndex: number
  secondaryBufferLength: number
} {
  const state = secondaryEngine.getState()
  return {
    secondaryCandles: state.candles,
    secondaryVisibleCandles: secondaryEngine.getVisibleCandles(),
    secondaryCurrentCandle: secondaryEngine.getCurrentCandle(),
    secondaryReplayIndex: state.index,
    secondaryBufferLength: state.candles.length
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
  /** Persisted MT imports shown in the symbol dropdown. */
  importedList: ImportedDatasetMeta[]
  mtBridge: MtBridgeConnectionStatus
  /** Unsaved EA history shown in the import dialog. */
  mtPreview: MtPreviewSummary | null
  /** 1m series for the active MetaTrader import (live updates + higher TF). */
  importedSourceCandles: Candle[]
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
  /** Chart rendering style shared by both panes. */
  chartType: ChartType
  drawTool: DrawTool
  drawings: Drawing[]
  /** First-click anchor for two-point tools (trendline, fib, rect). */
  pendingTrend: TrendPoint | null
  /** Drawing selected with the Select tool — target for the Delete shortcut. */
  selectedDrawingId: string | null
  position: Position | null
  pendingOrder: PendingOrder | null
  closedTrades: ClosedTrade[]
  tradeMarkers: TradeMarker[]
  sessionReport: SessionReport | null
  /** Reward multiple of risk for linked SL/TP (default 2 → 1:2). */
  riskReward: number
  /** Lots (FX/metals) or coin amount (crypto) used on the next open. */
  tradeSize: number
  /** TP/SL/limit typed or picked before a position/pending exists. */
  ticketTakeProfit: number | null
  ticketStopLoss: number | null
  ticketLimitPrice: number | null
  /** Market vs limit tab on the order ticket. */
  ticketOrderType: TicketOrderType
  /** Chart pick mode from the order-ticket TP/SL/limit handle. */
  pricePick: PricePickKind | null
  chartSplit: boolean
  secondaryTimeframe: string
  driverPane: DriverPane
  secondaryCandles: Candle[]
  secondaryVisibleCandles: Candle[]
  secondaryCurrentCandle: Candle | null
  secondaryReplayIndex: number
  secondaryBufferLength: number
  secondaryChartSync: ChartSync
  secondaryStatus: ChartStatus
  secondaryError: string | null
  secondaryLoading: boolean
  toggleIndicator: (id: string) => void
  setChartType: (type: ChartType) => void
  setDrawTool: (tool: DrawTool) => void
  addHorizontalLine: (price: number) => void
  updateHorizontalLine: (id: string, price: number) => void
  addTwoPoint: (point: TrendPoint) => void
  updateTwoPointEndpoint: (id: string, end: Endpoint, point: TrendPoint) => void
  updateRectHandle: (id: string, handle: RectHandle, point: TrendPoint) => void
  addPosition: (point: TrendPoint, levels?: { target: number | null; stop: number | null }) => void
  updatePositionLevel: (id: string, level: PositionLevel, price: number) => void
  clearPositionLevel: (id: string, level: PositionLevel) => void
  updatePositionEntry: (id: string, price: number) => void
  updatePositionSpan: (id: string, span: number) => void
  cloneDrawing: (id: string) => string | null
  moveDrawing: (id: string, origin: Drawing, dTime: number, dPrice: number) => void
  updateDrawingStyle: (id: string, patch: Partial<DrawingStyle>) => void
  updateDrawingLevels: (id: string, levels: FibLevelConfig[]) => void
  selectDrawing: (id: string | null) => void
  deleteDrawing: (id: string) => void
  clearDrawings: () => void
  paperBuy: () => void
  paperSell: () => void
  paperClose: () => void
  placeLimit: (side: 'long' | 'short', price: number) => void
  cancelPending: () => void
  setPendingPrice: (price: number) => void
  setRiskReward: (value: number) => void
  setTradeSize: (value: number) => void
  setTakeProfit: (price: number | null, opts?: LevelSetOptions) => void
  setStopLoss: (price: number | null, opts?: LevelSetOptions) => void
  setTicketTakeProfit: (price: number | null, opts?: LevelSetOptions) => void
  setTicketStopLoss: (price: number | null, opts?: LevelSetOptions) => void
  setTicketLimitPrice: (price: number | null) => void
  setTicketOrderType: (type: TicketOrderType) => void
  setPricePick: (kind: PricePickKind | null) => void
  applyPricePick: (price: number) => void
  dismissSessionReport: () => void
  setSymbol: (symbol: string) => void
  setTimeframe: (timeframe: string) => void
  setChartSplit: (split: boolean) => void
  setSecondaryTimeframe: (timeframe: string) => void
  setDriverPane: (pane: DriverPane) => void
  loadCandles: () => Promise<void>
  disconnectMetaTrader: () => void
  handleMtBridgeEvent: (event: MtBridgeIpcEvent) => void
  syncMtBridgeStatus: (status: MtBridgeConnectionStatus) => void
  activateImportedDataset: (candles: Candle[], meta: ImportedDatasetMeta) => void
  clearImportedDataset: () => void
  refreshImportedList: () => Promise<void>
  selectImportedDataset: (id: string, timeframe?: string) => Promise<void>
  startImportedReplay: () => void
  startImportedReplayAt: (startIndex: number, opts?: { message?: string | null }) => void
  startReplayAt: (
    startTimeSeconds: number,
    opts?: { forwardBars?: number; message?: string | null }
  ) => Promise<void>
  jumpToTime: (timeSeconds: number) => Promise<void>
  exitReplay: () => void
  play: () => void
  pause: () => void
  /** Pause playback after an open position is closed by TP or SL. */
  pauseOnTpSl: boolean
  setPauseOnTpSl: (value: boolean) => void
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
    const enteringReplay = get().mode !== 'replay'
    set((s) => ({
      mode: 'replay',
      candles: engine.getState().candles,
      ...snap,
      ...(enteringReplay ? emptyDrawingState() : {}),
      chartSync: {
        kind,
        fitContent: kind === 'append' ? false : fitContent,
        revision: s.chartSync.revision + 1
      }
    }))
  }

  function publishSecondary(kind: ChartSyncKind, opts: { fitContent?: boolean } = {}): void {
    const fitContent = opts.fitContent ?? kind === 'replace'
    set((s) => ({
      ...secondarySnapshot(),
      secondaryStatus: 'ready',
      secondaryError: null,
      secondaryChartSync: {
        kind,
        fitContent: kind === 'append' ? false : fitContent,
        revision: s.secondaryChartSync.revision + 1
      }
    }))
  }

  function clearSecondaryPane(opts: { keepTimeframe?: boolean } = {}): void {
    secondaryLoadGeneration += 1
    secondaryPrefetchInFlight = false
    secondaryEngine.load([])
    set((s) => ({
      ...emptySecondaryPaneState(),
      ...(opts.keepTimeframe ? {} : {}),
      secondaryChartSync: {
        kind: 'replace',
        fitContent: true,
        revision: s.secondaryChartSync.revision + 1
      }
    }))
  }

  function syncSecondaryToPrimaryCover(opts: { fitContent?: boolean } = {}): void {
    if (!get().chartSplit) return
    if (get().mode !== 'replay') return
    const candle = engine.getCurrentCandle()
    if (!candle) return
    if (secondaryEngine.getState().candles.length === 0) return

    const coverUntil = playheadCoverEnd(candle.time, intervalSecondsFor(get().timeframe))
    const before = secondaryEngine.getState().index
    secondaryEngine.seekToTime(coverUntil)
    const after = secondaryEngine.getState().index
    publishSecondary(after === before + 1 ? 'append' : 'replace', {
      fitContent: opts.fitContent ?? false
    })
  }

  function syncPrimaryToSecondaryCover(opts: { fitContent?: boolean } = {}): void {
    if (!get().chartSplit) return
    if (get().mode !== 'replay') return
    const candle = secondaryEngine.getCurrentCandle()
    if (!candle) return
    if (engine.getState().candles.length === 0) return

    const coverUntil = playheadCoverEnd(candle.time, intervalSecondsFor(get().secondaryTimeframe))
    const target = findIndexAtOrBefore(engine.getState().candles, coverUntil)
    if (target < 0) return

    const before = engine.getState().index
    if (target === before) return

    if (target > before) {
      while (engine.getState().index < target) {
        engine.stepForward()
        maybeAutoCloseOnLevels()
      }
      publishReplay(target - before === 1 ? 'append' : 'replace', {
        fitContent: opts.fitContent ?? false
      })
      return
    }

    engine.seekToIndex(target)
    publishReplay('replace', { fitContent: opts.fitContent ?? false })
  }

  function rewindPrimaryToIndex(target: number): void {
    while (engine.getState().index > target) {
      const leftCandle = engine.getCurrentCandle() || get().currentCandle
      const before = engine.getState().index
      engine.stepBackward()
      const after = engine.getState().index
      if (!(after < before && leftCandle)) continue

      const rewound = rewindTradesAfterStepBack({
        position: get().position,
        pendingOrder: get().pendingOrder,
        closedTrades: get().closedTrades,
        leftCandleTime: leftCandle.time,
        currentCandleTime:
          (engine.getCurrentCandle() || get().currentCandle)?.time ?? leftCandle.time
      })

      const discardSet = new Set(rewound.discardedEntryTimes)
      const tradeMarkers =
        discardSet.size === 0
          ? get().tradeMarkers
          : get().tradeMarkers.filter((marker) => !discardSet.has(marker.time))

      set({
        position: rewound.position,
        pendingOrder: rewound.pendingOrder,
        closedTrades: rewound.closedTrades,
        tradeMarkers,
        replayMessage: null
      })
    }
  }

  function currentPnlScale(): PnlScale {
    const lots = get().position?.lots ?? get().tradeSize
    return pnlScaleForSymbol(get().symbol, lots)
  }

  function pausePlayback(): void {
    if (get().mode !== 'replay') return
    engine.pause()
    secondaryEngine.pause()
    stopClock()
    publishStatus()
  }

  /** Fill a pending limit, then close an open position if TP/SL is hit. */
  function maybeAutoCloseOnLevels(): 'tp' | 'sl' | null {
    if (get().mode !== 'replay') return null
    if (get().replayLoading) return null

    const candle = engine.getCurrentCandle() || get().currentCandle
    if (!candle) return null

    const pending = get().pendingOrder
    if (pending && !get().position && evaluatePendingFill(pending, candle)) {
      const filled = pendingToPosition(pending, candle.time)
      const marker: TradeMarker = {
        time: candle.time,
        position: pending.side === 'long' ? 'belowBar' : 'aboveBar',
        color: pending.side === 'long' ? '#22c55e' : '#ef4444',
        shape: pending.side === 'long' ? 'arrowUp' : 'arrowDown',
        text: pending.side === 'long' ? 'B' : 'S'
      }
      set((s) => ({
        pendingOrder: null,
        position: filled,
        tradeMarkers: [...s.tradeMarkers, marker],
        replayMessage: null
      }))
      // Skip TP/SL on the fill bar — levels arm on later candles.
      return null
    }

    const open = get().position
    if (!open) return null
    if (open.takeProfit == null && open.stopLoss == null) return null

    const hit = evaluateStopTakeProfit(open, candle)
    if (!hit) return null

    const closed = closePosition(open, hit.price, candle.time, hit.hit, currentPnlScale())
    const pauseOnHit = get().pauseOnTpSl
    set((s) => ({
      position: null,
      closedTrades: [...s.closedTrades, closed],
      replayMessage: pauseOnHit
        ? hit.hit === 'tp'
          ? 'Paused · Take profit hit'
          : 'Paused · Stop loss hit'
        : null,
      ...EMPTY_TICKET_LEVELS
    }))

    if (pauseOnHit) pausePlayback()
    return hit.hit
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

  async function maybePrefetchSecondary(): Promise<void> {
    if (secondaryPrefetchInFlight) return
    if (!get().chartSplit) return
    if (get().mode !== 'replay') return
    if (!isBinanceDataSource(get().dataSource)) return
    if (!secondaryEngine.needsPrefetch()) return

    const buffer = secondaryEngine.getState().candles
    if (!buffer.length) return

    const last = buffer[buffer.length - 1]
    const { symbol, secondaryTimeframe } = get()
    const intervalSec = intervalSecondsFor(secondaryTimeframe)
    const nowSec = Math.floor(Date.now() / 1000)

    if (last.time + intervalSec >= nowSec) return

    secondaryPrefetchInFlight = true
    try {
      const more = await prefetchForward({
        symbol,
        interval: secondaryTimeframe,
        afterTimeSeconds: last.time,
        limit: PREFETCH_BATCH_SIZE
      })

      if (get().mode !== 'replay' || !get().chartSplit) return

      if (more.length > 0) {
        secondaryEngine.appendCandles(more)
        publishSecondary('replace', { fitContent: false })
      }
    } catch (err) {
      if (get().mode !== 'replay') return
      const message = err instanceof Error ? err.message : 'Secondary prefetch failed'
      set({ replayMessage: message })
    } finally {
      secondaryPrefetchInFlight = false
    }
  }

  async function maybePrefetch(): Promise<void> {
    if (prefetchInFlight) return
    if (get().mode !== 'replay') return
    if (!isBinanceDataSource(get().dataSource)) return
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

  async function loadImportedSeries(
    id: string,
    timeframe: string
  ): Promise<{ meta: ImportedDatasetMeta; candles: Candle[] } | null> {
    const loaded = await window.api.loadImport(id, timeframe)
    if (!loaded.ok) return null
    return { meta: loaded.meta, candles: dedupeCandlesByTime(loaded.candles) }
  }

  async function loadSecondaryLiveCandles(): Promise<void> {
    if (!get().chartSplit) return

    const generation = (secondaryLoadGeneration += 1)
    const { symbol, secondaryTimeframe, dataSource, importMeta, importedCandles, timeframe } = get()

    set({ secondaryStatus: 'loading', secondaryError: null, secondaryLoading: true })

    try {
      let candles: Candle[] = []

      if (dataSource === 'imported' && importMeta) {
        const source1m = get().importedSourceCandles
        if (isMetatraderImport(importMeta) && source1m.length) {
          candles = displayedFromSource(source1m, secondaryTimeframe)
        } else if (secondaryTimeframe === timeframe) {
          candles = importedCandles
        } else if (importMeta.timeframes?.[secondaryTimeframe]) {
          const loaded = await loadImportedSeries(importMeta.id, secondaryTimeframe)
          if (generation !== secondaryLoadGeneration || !get().chartSplit) return
          if (!loaded) {
            throw new Error(`No imported candles for ${secondaryTimeframe}.`)
          }
          candles = loaded.candles
        } else {
          throw new Error(`Timeframe ${secondaryTimeframe} is not available for this import.`)
        }
      } else {
        candles = await fetchCandles({
          symbol,
          interval: secondaryTimeframe
        })
      }

      if (generation !== secondaryLoadGeneration || !get().chartSplit) return

      secondaryEngine.load([])
      set((s) => ({
        secondaryCandles: candles,
        secondaryVisibleCandles: [],
        secondaryCurrentCandle: null,
        secondaryReplayIndex: 0,
        secondaryBufferLength: candles.length,
        secondaryStatus: 'ready',
        secondaryError: null,
        secondaryLoading: false,
        secondaryChartSync: {
          kind: 'replace',
          fitContent: true,
          revision: s.secondaryChartSync.revision + 1
        }
      }))
    } catch (err) {
      if (generation !== secondaryLoadGeneration) return
      const message = err instanceof Error ? err.message : 'Failed to load secondary candles'
      set({
        ...emptySecondaryPaneState(),
        secondaryStatus: 'error',
        secondaryError: message,
        secondaryLoading: false
      })
    }
  }

  async function loadSecondaryReplayWindow(anchorTimeSeconds: number): Promise<boolean> {
    if (!get().chartSplit) return false

    const startSec = Math.floor(Number(anchorTimeSeconds))
    if (!Number.isFinite(startSec)) return false

    const { symbol, secondaryTimeframe, dataSource, importMeta, importedCandles, timeframe } = get()
    const generation = (secondaryLoadGeneration += 1)

    if (dataSource === 'imported' && importMeta) {
      const source1m = get().importedSourceCandles
      let series = importedCandles
      if (isMetatraderImport(importMeta) && source1m.length) {
        series = displayedFromSource(source1m, secondaryTimeframe)
      } else if (secondaryTimeframe !== timeframe) {
        if (!importMeta.timeframes?.[secondaryTimeframe]) {
          set({
            secondaryLoading: false,
            secondaryStatus: 'error',
            secondaryError: `Timeframe ${secondaryTimeframe} is not available for this import.`
          })
          return false
        }
        const loaded = await loadImportedSeries(importMeta.id, secondaryTimeframe)
        if (generation !== secondaryLoadGeneration || !get().chartSplit) return false
        if (!loaded) {
          set({
            secondaryLoading: false,
            secondaryStatus: 'error',
            secondaryError: `No imported candles for ${secondaryTimeframe}.`
          })
          return false
        }
        series = loaded.candles
      }

      const keptSpeed = secondaryEngine.getState().speed
      secondaryEngine.load(series)
      secondaryEngine.setSpeed(keptSpeed)
      secondaryEngine.seekToTime(startSec)
      publishSecondary('replace', { fitContent: true })
      set({
        secondaryCandles: series,
        secondaryBufferLength: series.length,
        secondaryLoading: false,
        secondaryStatus: 'ready',
        secondaryError: null
      })
      return true
    }

    const intervalSec = intervalSecondsFor(secondaryTimeframe)
    const { startTimeMs, endTimeMs } = buildReplayWindowMs({
      startTimeSeconds: startSec,
      intervalSeconds: intervalSec
    })

    if (startTimeMs >= endTimeMs) {
      set({
        secondaryLoading: false,
        secondaryError: 'Could not build secondary candle window.',
        secondaryStatus: 'error'
      })
      return false
    }

    set({ secondaryLoading: true, secondaryError: null })

    try {
      const candles = await fetchCandlesRange({
        symbol,
        interval: secondaryTimeframe,
        startTime: startTimeMs,
        endTime: endTimeMs
      })

      if (generation !== secondaryLoadGeneration || !get().chartSplit) return false

      if (!candles.length) {
        set({
          secondaryLoading: false,
          secondaryStatus: 'error',
          secondaryError: 'No secondary candles found for that UTC range.'
        })
        return false
      }

      const keptSpeed = secondaryEngine.getState().speed
      secondaryEngine.load(candles)
      secondaryEngine.setSpeed(keptSpeed)

      if (startSec < candles[0].time) {
        secondaryEngine.seekToIndex(0)
      } else if (get().driverPane === 'secondary') {
        secondaryEngine.seekToTime(startSec)
      } else {
        secondaryEngine.seekToTime(playheadCoverEnd(startSec, intervalSecondsFor(get().timeframe)))
      }

      set({ secondaryLoading: false, secondaryStatus: 'ready', secondaryError: null })
      publishSecondary('replace', { fitContent: true })
      void maybePrefetchSecondary()
      return true
    } catch (err) {
      if (generation !== secondaryLoadGeneration) return false
      const message = err instanceof Error ? err.message : 'Failed to load secondary replay window'
      set({
        secondaryLoading: false,
        secondaryStatus: 'error',
        secondaryError: message
      })
      return false
    }
  }

  function alignSecondaryAfterPrimaryLoad(): void {
    if (!get().chartSplit || get().mode !== 'replay') return
    const candle = engine.getCurrentCandle() || get().currentCandle
    if (!candle) return
    void loadSecondaryReplayWindow(candle.time)
  }

  function driverEnded(): boolean {
    if (get().chartSplit && get().driverPane === 'secondary') {
      return secondaryEngine.getState().status === 'ended'
    }
    return engine.getState().status === 'ended'
  }

  function advanceDriverForward(): boolean {
    const split = get().chartSplit
    const driver = get().driverPane

    if (!split || driver === 'primary') {
      const before = engine.getState().index
      engine.stepForward()
      const after = engine.getState().index

      if (after > before) {
        publishReplay('append')
        maybeAutoCloseOnLevels()
        if (split) syncSecondaryToPrimaryCover()
        void maybePrefetch()
        void maybePrefetchSecondary()
        return true
      }

      publishReplay('replace', { fitContent: false })
      if (split) syncSecondaryToPrimaryCover()
      return false
    }

    const before = secondaryEngine.getState().index
    secondaryEngine.stepForward()
    const after = secondaryEngine.getState().index

    if (after > before) {
      publishSecondary('append')
      syncPrimaryToSecondaryCover()
      void maybePrefetch()
      void maybePrefetchSecondary()
      return true
    }

    publishSecondary('replace', { fitContent: false })
    return false
  }

  function retreatDriverBackward(): void {
    const split = get().chartSplit
    const driver = get().driverPane

    if (!split || driver === 'primary') {
      const leftCandle = engine.getCurrentCandle() || get().currentCandle
      const before = engine.getState().index
      engine.stepBackward()
      const after = engine.getState().index

      publishReplay('replace', { fitContent: false })
      if (split) syncSecondaryToPrimaryCover()

      if (after < before && leftCandle) {
        const rewound = rewindTradesAfterStepBack({
          position: get().position,
          pendingOrder: get().pendingOrder,
          closedTrades: get().closedTrades,
          leftCandleTime: leftCandle.time,
          currentCandleTime:
            (engine.getCurrentCandle() || get().currentCandle)?.time ?? leftCandle.time
        })

        const discardSet = new Set(rewound.discardedEntryTimes)
        const tradeMarkers =
          discardSet.size === 0
            ? get().tradeMarkers
            : get().tradeMarkers.filter((marker) => !discardSet.has(marker.time))

        set({
          position: rewound.position,
          pendingOrder: rewound.pendingOrder,
          closedTrades: rewound.closedTrades,
          tradeMarkers,
          replayMessage: null
        })
      }
      return
    }

    secondaryEngine.stepBackward()
    publishSecondary('replace', { fitContent: false })

    const candle = secondaryEngine.getCurrentCandle()
    if (!candle || engine.getState().candles.length === 0) return

    const coverUntil = playheadCoverEnd(candle.time, intervalSecondsFor(get().secondaryTimeframe))
    const target = findIndexAtOrBefore(engine.getState().candles, coverUntil)
    if (target < 0) return

    rewindPrimaryToIndex(target)
    publishReplay('replace', { fitContent: false })
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
      importedSourceCandles: [] as Candle[],
      symbol: meta.symbol,
      timeframe: meta.timeframe,
      tradeSize: clampTradeSizeForSymbol(s.tradeSize, meta.symbol),
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
      ...emptyDrawingState(),
      ...EMPTY_TICKET_LEVELS,
      position: null,
      pendingOrder: null,
      closedTrades: [],
      tradeMarkers: [],
      chartSync: {
        kind: 'replace',
        fitContent: true,
        revision: s.chartSync.revision + 1
      }
    }))
  }

  function startBufferReplay(
    candles: Candle[],
    startIndex: number,
    opts: { message?: string | null } = {}
  ): void {
    if (get().mode === 'replay') return
    if (!candles.length) {
      set({ replayMessage: 'No candles to replay.' })
      return
    }

    stopClock()
    const keptSpeed = engine.getState().speed
    engine.load(candles)
    engine.setSpeed(keptSpeed)

    const idx = Math.min(
      Math.max(0, Math.floor(Number(startIndex)) || 0),
      Math.max(candles.length - 1, 0)
    )
    engine.seekToIndex(idx)

    const defaultMessage =
      idx > 0 ? `Replay from candle ${idx + 1}.` : 'Replay from start of loaded candles.'

    set({
      candles,
      status: 'ready',
      replayLoading: false,
      replayMessage: opts.message ?? defaultMessage,
      error: null,
      speed: engine.getState().speed
    })
    publishReplay('replace', { fitContent: true })
    alignSecondaryAfterPrimaryLoad()
  }

  function startClock(): void {
    stopClock()

    clockTimer = setInterval(() => {
      const { mode, isPlaying } = get()
      if (mode !== 'replay' || !isPlaying) {
        stopClock()
        return
      }

      const advanced = advanceDriverForward()
      if (!advanced || driverEnded()) {
        stopClock()
        // Reflect ended/paused status from primary engine snapshot used by UI.
        if (get().chartSplit && get().driverPane === 'secondary' && driverEnded()) {
          engine.pause()
          set({ isPlaying: false, replayStatus: 'ended' })
        }
      }
    }, tickMs())
  }

  function resetReplayState(opts: { keepImport?: boolean; keepDrawings?: boolean } = {}): void {
    stopClock()
    prefetchInFlight = false
    secondaryPrefetchInFlight = false
    replayRequestId += 1
    engine.load([])
    secondaryEngine.load([])
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
      ...(opts.keepDrawings ? {} : emptyDrawingState()),
      ...EMPTY_TICKET_LEVELS,
      ticketOrderType: 'market' as TicketOrderType,
      position: null,
      pendingOrder: null,
      closedTrades: [],
      tradeMarkers: [],
      driverPane: 'primary',
      ...(opts.keepImport
        ? {}
        : {
            dataSource: 'binance' as const,
            importMeta: null,
            importedCandles: [] as Candle[],
            importedSourceCandles: [] as Candle[]
          }),
      chartSync: {
        kind: 'replace',
        fitContent: true,
        revision: s.chartSync.revision + 1
      },
      ...(s.chartSplit
        ? {}
        : {
            ...emptySecondaryPaneState(),
            secondaryChartSync: {
              kind: 'replace' as const,
              fitContent: true,
              revision: s.secondaryChartSync.revision + 1
            }
          })
    }))
  }

  function tryOpen(side: 'long' | 'short'): void {
    if (get().mode !== 'replay') return
    if (get().replayLoading) return
    if (get().replayStatus === 'ended') return

    const candle = engine.getCurrentCandle() || get().currentCandle
    if (!candle) return

    if (get().pendingOrder) {
      set({ replayMessage: 'Cancel the pending order first' })
      return
    }

    const result = openPosition(
      get().position,
      side,
      candle.close,
      candle.time,
      nextTradeId(),
      clampTradeSizeForSymbol(get().tradeSize, get().symbol)
    )
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

    const closed = closePosition(open, candle.close, candle.time, 'manual', currentPnlScale())

    set((s) => ({
      position: null,
      closedTrades: [...s.closedTrades, closed],
      replayMessage: null,
      ...EMPTY_TICKET_LEVELS
    }))
  }

  function tryPlaceLimit(side: 'long' | 'short', price: number): void {
    if (get().mode !== 'replay') return
    if (get().replayLoading) return
    if (get().replayStatus === 'ended') return

    const candle = engine.getCurrentCandle() || get().currentCandle
    if (!candle) return

    if (!Number.isFinite(price)) {
      set({ replayMessage: 'Pick or type a limit price' })
      return
    }

    const result = placePendingLimit({
      current: get().position,
      pending: get().pendingOrder,
      side,
      price,
      markPrice: candle.close,
      time: candle.time,
      id: nextTradeId(),
      lots: clampTradeSizeForSymbol(get().tradeSize, get().symbol)
    })
    if (!result.ok) {
      set({ replayMessage: result.reason })
      return
    }
    set({ pendingOrder: result.pending, replayMessage: null })
  }

  function tryCancelPending(): void {
    if (get().mode !== 'replay') return
    if (get().replayStatus === 'ended') return
    if (!get().pendingOrder) return
    set({ pendingOrder: null, replayMessage: null, ...EMPTY_TICKET_LEVELS })
  }

  function trySetPendingPrice(price: number): void {
    if (get().mode !== 'replay') return
    if (get().replayStatus === 'ended') return
    const pending = get().pendingOrder
    if (!pending) return
    const candle = engine.getCurrentCandle() || get().currentCandle
    const mark = candle?.close
    if (mark == null) return
    const result = withPendingPrice(pending, price, mark)
    if (!result.ok) {
      set({ replayMessage: result.reason })
      return
    }
    set({ pendingOrder: result.pending, replayMessage: null })
  }

  function setTakeProfit(price: number | null, opts?: LevelSetOptions): void {
    if (get().mode !== 'replay') return
    if (get().replayStatus === 'ended') return
    const open = get().position
    const pending = get().pendingOrder

    if (!open && pending) {
      let result = withPendingTakeProfit(pending, price)
      if (!result.ok) {
        set({ replayMessage: result.reason })
        return
      }
      if (opts?.linkRr && price != null && pending.stopLoss == null) {
        const linkedSl = stopLossFromTakeProfit(
          pending.side,
          pending.price,
          price,
          get().riskReward
        )
        if (linkedSl != null) {
          const withSl = withPendingStopLoss(result.pending, linkedSl)
          if (withSl.ok) result = withSl
        }
      }
      set({ pendingOrder: result.pending, replayMessage: null })
      return
    }

    if (!open) return

    let result = withTakeProfit(open, price)
    if (!result.ok) {
      set({ replayMessage: result.reason })
      return
    }

    // First-place guide: seed missing SL only — never overwrite an existing one.
    if (opts?.linkRr && price != null && open.stopLoss == null) {
      const linkedSl = stopLossFromTakeProfit(open.side, open.entryPrice, price, get().riskReward)
      if (linkedSl != null) {
        const candle = engine.getCurrentCandle() || get().currentCandle
        const withSl = withStopLoss(result.position, linkedSl, candle?.close)
        if (withSl.ok) result = withSl
      }
    }

    // Do not evaluate TP/SL against the candle that is current while placing —
    // levels only arm for subsequent candle advances.
    set({ position: result.position, replayMessage: null })
  }

  function setStopLoss(price: number | null, opts?: LevelSetOptions): void {
    if (get().mode !== 'replay') return
    if (get().replayStatus === 'ended') return
    const open = get().position
    const pending = get().pendingOrder

    if (!open && pending) {
      let result = withPendingStopLoss(pending, price)
      if (!result.ok) {
        set({ replayMessage: result.reason })
        return
      }
      if (opts?.linkRr && price != null && pending.takeProfit == null) {
        const linkedTp = takeProfitFromStopLoss(
          pending.side,
          pending.price,
          price,
          get().riskReward
        )
        if (linkedTp != null) {
          const withTp = withPendingTakeProfit(result.pending, linkedTp)
          if (withTp.ok) result = withTp
        }
      }
      set({ pendingOrder: result.pending, replayMessage: null })
      return
    }

    if (!open) return

    const candle = engine.getCurrentCandle() || get().currentCandle
    const markPrice = candle?.close
    let result = withStopLoss(open, price, markPrice)
    if (!result.ok) {
      set({ replayMessage: result.reason })
      return
    }

    // First-place guide: seed missing TP only — never overwrite an existing one.
    if (opts?.linkRr && price != null && open.takeProfit == null) {
      const linkedTp = takeProfitFromStopLoss(open.side, open.entryPrice, price, get().riskReward)
      if (linkedTp != null) {
        const withTp = withTakeProfit(result.position, linkedTp)
        if (withTp.ok) result = withTp
      }
    }

    // Do not evaluate TP/SL against the candle that is current while placing —
    // levels only arm for subsequent candle advances.
    set({ position: result.position, replayMessage: null })
  }

  function currentDraftLevels(): TicketDraftLevels {
    const s = get()
    return {
      orderType: s.ticketOrderType,
      markPrice: s.currentCandle?.close,
      limitPrice: s.ticketLimitPrice,
      takeProfit: s.ticketTakeProfit,
      stopLoss: s.ticketStopLoss
    }
  }

  function trySetTicketTakeProfit(price: number | null, opts?: LevelSetOptions): void {
    if (get().position || get().pendingOrder) return
    const patch: { ticketTakeProfit: number | null; ticketStopLoss?: number | null } = {
      ticketTakeProfit: price
    }
    if (opts?.linkRr && price != null && get().ticketStopLoss == null) {
      const linked = linkedTicketOpposite(
        'tp',
        price,
        ticketEntryPrice(currentDraftLevels()),
        get().riskReward
      )
      if (linked != null) patch.ticketStopLoss = linked
    }
    set(patch)
  }

  function trySetTicketStopLoss(price: number | null, opts?: LevelSetOptions): void {
    if (get().position || get().pendingOrder) return
    const patch: { ticketStopLoss: number | null; ticketTakeProfit?: number | null } = {
      ticketStopLoss: price
    }
    if (opts?.linkRr && price != null && get().ticketTakeProfit == null) {
      const linked = linkedTicketOpposite(
        'sl',
        price,
        ticketEntryPrice(currentDraftLevels()),
        get().riskReward
      )
      if (linked != null) patch.ticketTakeProfit = linked
    }
    set(patch)
  }

  function trySetTicketLimitPrice(price: number | null): void {
    if (get().position || get().pendingOrder) return
    const s = get()
    const patch: {
      ticketLimitPrice: number | null
      ticketTakeProfit?: number | null
      ticketStopLoss?: number | null
    } = { ticketLimitPrice: price }
    const entry = ticketEntryPrice({
      orderType: s.ticketOrderType,
      markPrice: s.currentCandle?.close,
      limitPrice: price,
      takeProfit: s.ticketTakeProfit,
      stopLoss: s.ticketStopLoss
    })
    if (entry != null) {
      if (s.ticketStopLoss != null && s.ticketTakeProfit == null) {
        const linked = linkedTicketOpposite('sl', s.ticketStopLoss, entry, s.riskReward)
        if (linked != null) patch.ticketTakeProfit = linked
      } else if (s.ticketTakeProfit != null && s.ticketStopLoss == null) {
        const linked = linkedTicketOpposite('tp', s.ticketTakeProfit, entry, s.riskReward)
        if (linked != null) patch.ticketStopLoss = linked
      }
    }
    set(patch)
  }

  /** Re-apply R:R guide to open or pending levels when the user changes the R:R control. */
  function applyRiskRewardGuide(riskReward: number): void {
    if (get().mode !== 'replay' || get().replayStatus === 'ended') return

    const pending = get().pendingOrder
    if (!get().position && pending) {
      let next = pending
      if (pending.stopLoss != null) {
        const linkedTp = takeProfitFromStopLoss(
          pending.side,
          pending.price,
          pending.stopLoss,
          riskReward
        )
        if (linkedTp != null) {
          const withTp = withPendingTakeProfit(next, linkedTp)
          if (withTp.ok) next = withTp.pending
        }
      } else if (pending.takeProfit != null) {
        const linkedSl = stopLossFromTakeProfit(
          pending.side,
          pending.price,
          pending.takeProfit,
          riskReward
        )
        if (linkedSl != null) {
          const withSl = withPendingStopLoss(next, linkedSl)
          if (withSl.ok) next = withSl.pending
        }
      }
      if (next !== pending) {
        set({ pendingOrder: next, replayMessage: null })
      }
      return
    }

    const open = get().position
    if (!open) {
      const entry = ticketEntryPrice(currentDraftLevels())
      if (entry == null) return
      const sl = get().ticketStopLoss
      const tp = get().ticketTakeProfit
      if (sl != null) {
        const linked = linkedTicketOpposite('sl', sl, entry, riskReward)
        if (linked != null) set({ ticketTakeProfit: linked })
      } else if (tp != null) {
        const linked = linkedTicketOpposite('tp', tp, entry, riskReward)
        if (linked != null) set({ ticketStopLoss: linked })
      }
      return
    }

    let next = open
    if (open.stopLoss != null) {
      const linkedTp = takeProfitFromStopLoss(open.side, open.entryPrice, open.stopLoss, riskReward)
      if (linkedTp != null) {
        const withTp = withTakeProfit(next, linkedTp)
        if (withTp.ok) next = withTp.position
      }
    } else if (open.takeProfit != null) {
      const linkedSl = stopLossFromTakeProfit(
        open.side,
        open.entryPrice,
        open.takeProfit,
        riskReward
      )
      if (linkedSl != null) {
        const candle = engine.getCurrentCandle() || get().currentCandle
        const withSl = withStopLoss(next, linkedSl, candle?.close)
        if (withSl.ok) next = withSl.position
      }
    }

    if (next !== open) {
      set({ position: next, replayMessage: null })
    }
  }

  async function loadReplayWindow(
    startTimeSeconds: number,
    opts: { clampMessage?: boolean; message?: string | null; forwardBars?: number } = {}
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
    const windowOpts: {
      startTimeSeconds: number
      intervalSeconds: number
      forwardBars?: number
    } = {
      startTimeSeconds: startSec,
      intervalSeconds: intervalSec
    }
    if (opts.forwardBars != null && Number.isFinite(opts.forwardBars)) {
      windowOpts.forwardBars = Math.max(1, Math.floor(opts.forwardBars))
    }
    const { startTimeMs, endTimeMs } = buildReplayWindowMs(windowOpts)

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
      alignSecondaryAfterPrimaryLoad()
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

    if (get().dataSource === 'imported') {
      const meta = get().importMeta
      if (!meta?.timeframes?.[nextTimeframe]) {
        set({
          replayMessage: `Timeframe ${nextTimeframe} is not available for this import.`
        })
        return
      }

      set({ replayLoading: true, timeframe: nextTimeframe, replayMessage: null })
      const loaded = await loadImportedSeries(meta.id, nextTimeframe)
      if (!loaded) {
        set({
          timeframe: previousTimeframe,
          replayLoading: false,
          replayMessage: `Failed to load imported ${nextTimeframe} candles.`
        })
        return
      }

      const remappedMarkers = get().tradeMarkers.map((marker) => ({
        ...marker,
        time: alignTimeToInterval(marker.time, nextIntervalSec)
      }))
      const remappedDrawings = remapDrawingsToInterval(get().drawings, nextIntervalSec)
      const remappedPending = remapPendingTrendToInterval(get().pendingTrend, nextIntervalSec)
      const remappedPendingOrder = remapPendingOrderToInterval(get().pendingOrder, nextIntervalSec)
      const remappedPosition = remapPositionTimes(get().position, nextIntervalSec)
      const remappedClosed = get().closedTrades.map((trade) => ({
        ...trade,
        entryTime: alignTimeToInterval(trade.entryTime, nextIntervalSec),
        exitTime: alignTimeToInterval(trade.exitTime, nextIntervalSec),
        pendingPlacedTime:
          trade.pendingPlacedTime != null
            ? alignTimeToInterval(trade.pendingPlacedTime, nextIntervalSec)
            : trade.pendingPlacedTime
      }))

      const keptSpeed = engine.getState().speed
      engine.load(loaded.candles)
      engine.setSpeed(keptSpeed)
      engine.seekToTime(seekTime)

      set({
        importMeta: loaded.meta,
        importedCandles: loaded.candles,
        candles: loaded.candles,
        tradeMarkers: remappedMarkers,
        drawings: remappedDrawings,
        pendingTrend: remappedPending,
        pendingOrder: remappedPendingOrder,
        position: remappedPosition,
        closedTrades: remappedClosed,
        replayLoading: false,
        replayMessage: `Switched imported replay to ${nextTimeframe}.`,
        status: 'ready',
        error: null,
        speed: engine.getState().speed
      })
      publishReplay('replace', { fitContent: true })
      alignSecondaryAfterPrimaryLoad()
      return
    }

    // Keep the open position, session PnL, and drawings. Remap trade markers
    // and trendline endpoints onto the new candle open grid so LWC can resolve
    // their times after the series changes. Position TP/SL stay as absolute prices.
    const remappedMarkers = get().tradeMarkers.map((marker) => ({
      ...marker,
      time: alignTimeToInterval(marker.time, nextIntervalSec)
    }))
    const remappedDrawings = remapDrawingsToInterval(get().drawings, nextIntervalSec)
    const remappedPending = remapPendingTrendToInterval(get().pendingTrend, nextIntervalSec)
    const remappedPendingOrder = remapPendingOrderToInterval(get().pendingOrder, nextIntervalSec)
    const remappedPosition = remapPositionTimes(get().position, nextIntervalSec)

    const remappedClosed = get().closedTrades.map((trade) => ({
      ...trade,
      entryTime: alignTimeToInterval(trade.entryTime, nextIntervalSec),
      exitTime: alignTimeToInterval(trade.exitTime, nextIntervalSec),
      pendingPlacedTime:
        trade.pendingPlacedTime != null
          ? alignTimeToInterval(trade.pendingPlacedTime, nextIntervalSec)
          : trade.pendingPlacedTime
    }))

    set({
      timeframe: nextTimeframe,
      drawings: remappedDrawings,
      pendingTrend: remappedPending,
      pendingOrder: remappedPendingOrder,
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
    importedList: [],
    mtBridge: { ...DEFAULT_MT_BRIDGE_STATUS },
    mtPreview: null,
    importedSourceCandles: [],
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
    pauseOnTpSl: loadPauseOnTpSl(),
    activeIndicators: [],
    chartType: 'candlestick',
    drawTool: 'select',
    drawings: [],
    pendingTrend: null,
    selectedDrawingId: null,
    position: null,
    pendingOrder: null,
    closedTrades: [],
    tradeMarkers: [],
    sessionReport: null,
    riskReward: DEFAULT_RISK_REWARD,
    tradeSize: DEFAULT_LOTS,
    ticketOrderType: 'market',
    ...EMPTY_TICKET_LEVELS,
    chartSplit: false,
    secondaryTimeframe: defaultSecondaryTimeframe(DEFAULT_TIMEFRAME),
    driverPane: 'primary',
    secondaryCandles: [],
    secondaryVisibleCandles: [],
    secondaryCurrentCandle: null,
    secondaryReplayIndex: 0,
    secondaryBufferLength: 0,
    secondaryChartSync: { kind: 'replace', fitContent: true, revision: 0 },
    secondaryStatus: 'idle',
    secondaryError: null,
    secondaryLoading: false,

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

    setChartType(type) {
      if (!isChartType(type)) return
      if (type === get().chartType) return
      set({ chartType: type })
    },

    setDrawTool(tool) {
      if (!isDrawTool(tool)) return
      set({ drawTool: tool, pendingTrend: null, pricePick: null })
    },

    addHorizontalLine(price) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!Number.isFinite(price)) return
      const id = nextDrawingId()
      set((s) => ({
        drawTool: 'select',
        drawings: [
          ...s.drawings,
          { id, type: 'hline', price, style: defaultStyleForTool('hline') }
        ],
        selectedDrawingId: id
      }))
    },

    updateHorizontalLine(id, price) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !Number.isFinite(price)) return
      set((s) => ({
        drawings: s.drawings.map((d) => (d.type === 'hline' && d.id === id ? { ...d, price } : d))
      }))
    },

    addTwoPoint(point) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!point || !Number.isFinite(point.time) || !Number.isFinite(point.price)) {
        return
      }

      const tool = get().drawTool
      if (!isTwoPointTool(tool)) return

      const pending = get().pendingTrend
      if (!pending) {
        set({ pendingTrend: point })
        return
      }

      const id = nextDrawingId()
      set((s) => ({
        pendingTrend: null,
        drawTool: 'select',
        drawings: [
          ...s.drawings,
          {
            id,
            type: tool,
            t1: pending.time,
            p1: pending.price,
            t2: point.time,
            p2: point.price,
            style: defaultStyleForTool(tool),
            levels: tool === 'fib' ? defaultFibLevelsForTool() : undefined
          }
        ],
        selectedDrawingId: id
      }))
    },

    updateTwoPointEndpoint(id, end, point) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !point) return
      if (!Number.isFinite(point.time) || !Number.isFinite(point.price)) return
      set((s) => ({
        drawings: s.drawings.map((d) => {
          if ((d.type !== 'trendline' && d.type !== 'fib') || d.id !== id) return d
          return updateTwoPointEndpointGeom(d, end, point)
        })
      }))
    },

    updateRectHandle(id, handle, point) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !point) return
      if (!Number.isFinite(point.time) || !Number.isFinite(point.price)) return
      set((s) => ({
        drawings: s.drawings.map((d) =>
          d.type === 'rect' && d.id === id ? updateRectHandleGeom(d, handle, point) : d
        )
      }))
    },

    addPosition(point, levels) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      const tool = get().drawTool
      if (!isPositionTool(tool)) return
      if (!point || !Number.isFinite(point.time) || !Number.isFinite(point.price)) return
      const id = nextDrawingId()
      let target = levels?.target ?? null
      let stop = levels?.stop ?? null
      if (target != null && !isValidPositionLevel(tool, 'target', point.price, target)) {
        target = null
      }
      if (stop != null && !isValidPositionLevel(tool, 'stop', point.price, stop)) {
        stop = null
      }
      set((s) => ({
        drawTool: 'select',
        drawings: [
          ...s.drawings,
          {
            id,
            type: tool,
            t: point.time,
            entry: point.price,
            target,
            stop,
            span: POSITION_SPAN_DEFAULT,
            style: defaultStyleForTool(tool)
          } satisfies PositionDrawing
        ],
        selectedDrawingId: id
      }))
    },

    updatePositionLevel(id, level, price) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !Number.isFinite(price)) return
      set((s) => ({
        drawings: s.drawings.map((d) => {
          if (!isPositionDrawing(d) || d.id !== id) return d
          if (!isValidPositionLevel(d.type, level, d.entry, price)) return d
          return level === 'target' ? { ...d, target: price } : { ...d, stop: price }
        })
      }))
    },

    clearPositionLevel(id, level) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id) return
      set((s) => ({
        drawings: s.drawings.map((d) => {
          if (!isPositionDrawing(d) || d.id !== id) return d
          return level === 'target' ? { ...d, target: null } : { ...d, stop: null }
        })
      }))
    },

    updatePositionEntry(id, price) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !Number.isFinite(price)) return
      set((s) => ({
        drawings: s.drawings.map((d) =>
          isPositionDrawing(d) && d.id === id ? { ...d, entry: price } : d
        )
      }))
    },

    updatePositionSpan(id, span) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !Number.isFinite(span)) return
      const clamped = Math.max(POSITION_SPAN_MIN, Math.min(POSITION_SPAN_MAX, Math.round(span)))
      set((s) => ({
        drawings: s.drawings.map((d) =>
          isPositionDrawing(d) && d.id === id ? { ...d, span: clamped } : d
        )
      }))
    },

    cloneDrawing(id) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return null
      if (!id) return null
      const source = get().drawings.find((d) => d.id === id)
      if (!source) return null
      const copy = cloneDrawingGeom(source, nextDrawingId())
      set((s) => ({
        drawings: [...s.drawings, copy],
        selectedDrawingId: copy.id
      }))
      return copy.id
    },

    moveDrawing(id, origin, dTime, dPrice) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || origin.id !== id) return
      if (!Number.isFinite(dTime) || !Number.isFinite(dPrice)) return
      const next = translateDrawing(origin, dTime, dPrice)
      set((s) => ({
        drawings: s.drawings.map((d) => (d.id === id ? next : d))
      }))
    },

    updateDrawingStyle(id, patch) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !patch) return
      set((s) => ({
        drawings: s.drawings.map((d) => {
          if (d.id !== id) return d
          const base = d.style ?? defaultStyleForTool(drawingToolType(d))
          return { ...d, style: { ...base, ...patch } }
        })
      }))
    },

    updateDrawingLevels(id, levels) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id || !Array.isArray(levels)) return
      set((s) => ({
        drawings: s.drawings.map((d) =>
          d.type === 'fib' && d.id === id ? { ...d, levels: levels.map((l) => ({ ...l })) } : d
        )
      }))
    },

    clearDrawings() {
      set({ drawings: [], pendingTrend: null, selectedDrawingId: null })
    },

    selectDrawing(id) {
      set({ selectedDrawingId: id })
    },

    deleteDrawing(id) {
      if (get().mode === 'replay' && get().replayStatus === 'ended') return
      if (!id) return
      set((s) => ({
        drawings: s.drawings.filter((drawing) => drawing.id !== id),
        selectedDrawingId: s.selectedDrawingId === id ? null : s.selectedDrawingId
      }))
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

    placeLimit(side, price) {
      tryPlaceLimit(side, price)
    },

    cancelPending() {
      tryCancelPending()
    },

    setPendingPrice(price) {
      trySetPendingPrice(price)
    },

    setRiskReward(value) {
      const riskReward = clampRiskReward(value)
      set({ riskReward })
      applyRiskRewardGuide(riskReward)
    },

    setTradeSize(value) {
      if (get().position || get().pendingOrder) return
      set({ tradeSize: clampTradeSizeForSymbol(value, get().symbol) })
    },

    setTakeProfit(price, opts) {
      setTakeProfit(price, opts)
    },

    setStopLoss(price, opts) {
      setStopLoss(price, opts)
    },

    setTicketTakeProfit(price, opts) {
      trySetTicketTakeProfit(price, opts)
    },

    setTicketStopLoss(price, opts) {
      trySetTicketStopLoss(price, opts)
    },

    setTicketLimitPrice(price) {
      trySetTicketLimitPrice(price)
    },

    setTicketOrderType(type) {
      if (type !== 'market' && type !== 'limit') return
      set({ ticketOrderType: type })
      if (type === 'market' && get().pricePick === 'limit') {
        set({ pricePick: null })
      }
    },

    setPricePick(kind) {
      if (kind == null) {
        set({ pricePick: null })
        return
      }
      if (get().mode !== 'replay') return
      if (get().replayStatus === 'ended') return
      const next = get().pricePick === kind ? null : kind
      set({ pricePick: next, drawTool: 'select', pendingTrend: null })
    },

    applyPricePick(price) {
      const kind = get().pricePick
      if (!kind) return
      if (get().mode !== 'replay') return
      if (get().replayStatus === 'ended') return
      if (!Number.isFinite(price)) return

      const open = get().position
      const pending = get().pendingOrder

      if (kind === 'limit') {
        if (open && !pending) return
        if (pending) {
          trySetPendingPrice(price)
          if (get().pendingOrder?.price === price) set({ pricePick: null })
          return
        }
        trySetTicketLimitPrice(price)
        set({ pricePick: null, replayMessage: null })
        return
      }

      if (!open && !pending) {
        if (kind === 'tp') trySetTicketTakeProfit(price, { linkRr: true })
        else trySetTicketStopLoss(price, { linkRr: true })
        set({ pricePick: null, replayMessage: null })
        return
      }

      if (kind === 'tp') setTakeProfit(price, { linkRr: true })
      else setStopLoss(price, { linkRr: true })

      const next = get().position ?? get().pendingOrder
      const applied = kind === 'tp' ? next?.takeProfit === price : next?.stopLoss === price
      if (applied) set({ pricePick: null })
    },

    dismissSessionReport() {
      set({ sessionReport: null })
    },

    setSymbol(symbol) {
      if (symbol === get().symbol && get().dataSource === 'binance') return
      // Replay sessions are locked to the symbol they started on.
      if (get().mode === 'replay') return
      resetReplayState()
      set({
        symbol,
        dataSource: 'binance',
        importMeta: null,
        importedCandles: [],
        tradeSize: clampTradeSizeForSymbol(get().tradeSize, symbol)
      })
      void get().loadCandles()
    },

    setTimeframe(timeframe) {
      if (timeframe === get().timeframe) return
      if (!TIMEFRAMES[timeframe]) return

      if (get().mode === 'replay') {
        void switchReplayTimeframe(timeframe)
        return
      }

      if (get().dataSource === 'imported') {
        const meta = get().importMeta
        if (!meta?.timeframes?.[timeframe]) {
          set({ error: `Timeframe ${timeframe} is not available for this import.` })
          return
        }
        const nextIntervalSec = intervalSecondsFor(timeframe)
        const source1m = get().importedSourceCandles
        if (isMetatraderImport(meta) && source1m.length) {
          const displayed = displayedFromSource(source1m, timeframe)
          set((s) => ({
            timeframe,
            candles: displayed,
            importedCandles: displayed,
            importMeta: { ...meta, timeframe },
            drawings: remapDrawingsToInterval(get().drawings, nextIntervalSec),
            pendingTrend: remapPendingTrendToInterval(get().pendingTrend, nextIntervalSec),
            currentCandle: null,
            status: 'ready' as const,
            error: null,
            replayMessage: `MetaTrader ${meta.symbol} ${timeframe} · ${displayed.length.toLocaleString()} candles`,
            chartSync: {
              kind: 'replace' as const,
              fitContent: true,
              revision: s.chartSync.revision + 1
            }
          }))
          if (get().chartSplit) {
            void loadSecondaryLiveCandles()
          }
          return
        }
        void (async () => {
          set({
            status: 'loading',
            error: null,
            timeframe,
            drawings: remapDrawingsToInterval(get().drawings, nextIntervalSec),
            pendingTrend: remapPendingTrendToInterval(get().pendingTrend, nextIntervalSec)
          })
          const loaded = await loadImportedSeries(meta.id, timeframe)
          if (!loaded) {
            set({
              status: 'error',
              error: `Failed to load imported ${timeframe} candles.`
            })
            return
          }
          set((s) => ({
            importMeta: loaded.meta,
            importedCandles: loaded.candles,
            candles: loaded.candles,
            symbol: loaded.meta.symbol,
            timeframe: loaded.meta.timeframe,
            tradeSize: clampTradeSizeForSymbol(get().tradeSize, loaded.meta.symbol),
            currentCandle: null,
            status: 'ready' as const,
            error: null,
            replayMessage: `Imported ${loaded.meta.symbol} ${loaded.meta.timeframe} · ${loaded.candles.length.toLocaleString()} candles`,
            chartSync: {
              kind: 'replace' as const,
              fitContent: true,
              revision: s.chartSync.revision + 1
            }
          }))
          if (get().chartSplit) {
            void loadSecondaryLiveCandles()
          }
        })()
        return
      }

      const nextIntervalSec = intervalSecondsFor(timeframe)
      const remappedDrawings = remapDrawingsToInterval(get().drawings, nextIntervalSec)
      const remappedPending = remapPendingTrendToInterval(get().pendingTrend, nextIntervalSec)
      resetReplayState({ keepDrawings: true })
      set({
        timeframe,
        candles: [],
        drawings: remappedDrawings,
        pendingTrend: remappedPending
      })
      void get().loadCandles()
      if (get().chartSplit) {
        void loadSecondaryLiveCandles()
      }
    },

    setChartSplit(split) {
      const next = Boolean(split)
      if (next === get().chartSplit) return

      if (!next) {
        stopClock()
        if (get().isPlaying) {
          engine.pause()
          set({
            isPlaying: false,
            replayStatus: get().replayStatus === 'ended' ? 'ended' : 'paused'
          })
        }
        clearSecondaryPane()
        set({ chartSplit: false, driverPane: 'primary' })
        return
      }

      const secondaryTimeframe =
        get().secondaryTimeframe === get().timeframe
          ? defaultSecondaryTimeframe(get().timeframe)
          : get().secondaryTimeframe

      set({ chartSplit: true, secondaryTimeframe, driverPane: 'primary' })

      if (get().mode === 'replay') {
        const candle = engine.getCurrentCandle() || get().currentCandle
        if (candle) {
          void loadSecondaryReplayWindow(candle.time)
        }
      } else {
        void loadSecondaryLiveCandles()
      }
    },

    setSecondaryTimeframe(timeframe) {
      if (!get().chartSplit) return
      if (!TIMEFRAMES[timeframe]) return
      if (timeframe === get().secondaryTimeframe) return

      if (get().dataSource === 'imported') {
        const meta = get().importMeta
        if (!meta?.timeframes?.[timeframe]) {
          set({ secondaryError: `Timeframe ${timeframe} is not available for this import.` })
          return
        }
      }

      set({ secondaryTimeframe: timeframe })

      if (get().mode === 'replay') {
        const driverCandle =
          get().driverPane === 'secondary'
            ? secondaryEngine.getCurrentCandle() || get().secondaryCurrentCandle
            : engine.getCurrentCandle() || get().currentCandle
        const anchor = driverCandle?.time
        if (anchor == null) {
          set({ secondaryError: 'Cannot change secondary timeframe without a playhead.' })
          return
        }
        void loadSecondaryReplayWindow(anchor).then((ok) => {
          if (!ok) return
          if (get().driverPane === 'secondary') {
            syncPrimaryToSecondaryCover({ fitContent: false })
          } else {
            syncSecondaryToPrimaryCover({ fitContent: false })
          }
        })
        return
      }

      void loadSecondaryLiveCandles()
    },

    setDriverPane(pane) {
      if (pane !== 'primary' && pane !== 'secondary') return
      if (!get().chartSplit) return
      if (get().mode !== 'replay') {
        set({ driverPane: pane })
        return
      }
      if (pane === get().driverPane) return

      stopClock()
      engine.pause()
      secondaryEngine.pause()
      set({ driverPane: pane, isPlaying: false })

      if (pane === 'primary') {
        syncSecondaryToPrimaryCover({ fitContent: false })
        publishStatus()
      } else {
        syncPrimaryToSecondaryCover({ fitContent: false })
        publishSecondary('replace', { fitContent: false })
        publishStatus()
      }
    },

    async loadCandles() {
      const generation = (loadGeneration += 1)

      if (get().dataSource === 'imported') {
        const meta = get().importMeta
        if (!meta) {
          set({
            candles: [],
            status: 'error',
            error: 'Imported dataset is empty. Import a CSV or return to live Binance data.'
          })
          return
        }

        set({ status: 'loading', error: null })
        const loaded = await loadImportedSeries(meta.id, get().timeframe || meta.timeframe)
        if (generation !== loadGeneration) return
        if (!loaded) {
          set({
            candles: [],
            status: 'error',
            error: 'Failed to load imported candles.'
          })
          return
        }

        set({
          importMeta: loaded.meta,
          importedCandles: loaded.candles,
          candles: loaded.candles,
          status: 'ready',
          error: null,
          symbol: loaded.meta.symbol,
          timeframe: loaded.meta.timeframe,
          tradeSize: clampTradeSizeForSymbol(get().tradeSize, loaded.meta.symbol),
          replayMessage: `Imported ${loaded.meta.symbol} ${loaded.meta.timeframe} · ${loaded.candles.length.toLocaleString()} candles`
        })
        if (get().chartSplit) {
          void loadSecondaryLiveCandles()
        }
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
        if (get().chartSplit) {
          void loadSecondaryLiveCandles()
        }
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

    syncMtBridgeStatus(status) {
      set({
        mtBridge: {
          listening: status.listening,
          port: status.port,
          connected: status.connected,
          ...(status.error ? { error: status.error } : {}),
          ...(status.symbol ? { symbol: status.symbol } : {}),
          ...(status.timeframe ? { timeframe: status.timeframe } : {}),
          ...(status.datasetId ? { datasetId: status.datasetId } : {}),
          ...(status.preview ? { preview: status.preview } : {})
        },
        ...(status.preview ? { mtPreview: status.preview } : {})
      })
    },

    disconnectMetaTrader() {
      if (get().mode === 'replay') return
      if (get().dataSource !== 'mtbridge' && !isMetatraderImport(get().importMeta)) return
      resetReplayState()
      set({
        symbol: DEFAULT_SYMBOL.binanceSymbol,
        timeframe: DEFAULT_TIMEFRAME,
        candles: []
      })
      void get().loadCandles()
    },

    handleMtBridgeEvent(event) {
      if (event.type === 'status') {
        get().syncMtBridgeStatus(event)
        return
      }

      if (event.type === 'error') {
        set((s) => ({
          mtBridge: { ...s.mtBridge, error: event.message }
        }))
        return
      }

      if (event.type === 'disconnected') {
        set((s) => ({
          mtBridge: { ...s.mtBridge, connected: false }
        }))
        return
      }

      if (event.type === 'hello') {
        return
      }

      if (event.type === 'preview') {
        set((s) => ({
          mtPreview: event.preview,
          mtBridge: { ...s.mtBridge, preview: event.preview, symbol: event.preview.symbol }
        }))
        return
      }

      if (event.type === 'dataset') {
        void get().refreshImportedList()
        return
      }

      if (event.type === 'bar') {
        // Preview-only. Confirmed imports stay a static 1m snapshot so timeframe
        // switches can aggregate without fighting an online feed.
        return
      }
    },

    activateImportedDataset(candles, meta) {
      const normalized = dedupeCandlesByTime(candles)
      if (!normalized.length) {
        set({ status: 'error', error: 'Imported file has no valid candles.' })
        return
      }
      publishImportedPreview(normalized, meta)
      if (isMetatraderImport(meta)) {
        if (meta.timeframe === '1m') {
          set({ importedSourceCandles: normalized })
        } else {
          void window.api.loadImport(meta.id, '1m').then((source) => {
            if (source.ok) set({ importedSourceCandles: dedupeCandlesByTime(source.candles) })
          })
        }
      }
      void get().refreshImportedList()
      if (get().chartSplit) {
        void loadSecondaryLiveCandles()
      }
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

    async refreshImportedList() {
      const result = await window.api.listImports()
      if (!result.ok) return
      set({ importedList: result.imports })
    },

    async selectImportedDataset(id, timeframe) {
      if (!id) return
      if (get().mode === 'replay') return

      set({ status: 'loading', error: null })
      const loaded = await window.api.loadImport(id, timeframe)
      if (!loaded.ok) {
        set({ status: 'error', error: loaded.error })
        return
      }

      const candles = dedupeCandlesByTime(loaded.candles)
      if (!candles.length) {
        set({ status: 'error', error: 'Imported file has no valid candles.' })
        return
      }

      publishImportedPreview(candles, loaded.meta)
      if (isMetatraderImport(loaded.meta)) {
        if (loaded.meta.timeframe === '1m') {
          set({
            importedSourceCandles: candles,
            replayMessage: `MetaTrader ${loaded.meta.symbol} ${loaded.meta.timeframe} · ${candles.length.toLocaleString()} candles`
          })
        } else {
          const source = await window.api.loadImport(id, '1m')
          if (source.ok) {
            set({
              importedSourceCandles: dedupeCandlesByTime(source.candles),
              replayMessage: `MetaTrader ${loaded.meta.symbol} ${loaded.meta.timeframe} · ${candles.length.toLocaleString()} candles`
            })
          }
        }
      }
      if (get().chartSplit) {
        void loadSecondaryLiveCandles()
      }
    },

    startImportedReplay() {
      // Start on the 5th candle (index 4) so the first bars are visible as context.
      get().startImportedReplayAt(4)
    },

    startImportedReplayAt(startIndex, opts = {}) {
      if (get().dataSource !== 'imported') return
      if (get().mode === 'replay') return

      const candles = get().importedCandles
      if (!candles.length) {
        set({ replayMessage: 'No imported candles to replay.' })
        return
      }

      const idx = Math.min(
        Math.max(0, Math.floor(Number(startIndex)) || 0),
        Math.max(candles.length - 1, 0)
      )
      const defaultMessage =
        idx > 0
          ? `Replay from candle ${idx + 1} of imported file.`
          : 'Replay from start of imported file.'
      startBufferReplay(candles, idx, { message: opts.message ?? defaultMessage })
    },

    async startReplayAt(startTimeSeconds, opts = {}) {
      if (get().dataSource === 'imported') {
        get().startImportedReplay()
        return
      }
      await loadReplayWindow(startTimeSeconds, {
        message: opts.message,
        forwardBars: opts.forwardBars
      })
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
      secondaryEngine.pause()
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
          alignSecondaryAfterPrimaryLoad()
          return
        }
      }

      if (!isBinanceDataSource(get().dataSource)) {
        set({
          replayMessage: 'Jump time is outside the loaded range.'
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
      const {
        position,
        closedTrades,
        symbol,
        timeframe,
        currentCandle,
        dataSource,
        importedCandles,
        importMeta
      } = get()

      let trades = [...closedTrades]
      let closedOpenOnExit = false

      if (position) {
        const candle = engine.getCurrentCandle() || currentCandle
        if (candle) {
          trades = [
            ...trades,
            closePosition(
              position,
              candle.close,
              candle.time,
              'session_exit',
              pnlScaleForSymbol(symbol, position.lots)
            )
          ]
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

      secondaryEngine.load([])

      if (dataSource === 'imported' && importMeta && importedCandles.length) {
        const source1m = get().importedSourceCandles
        publishImportedPreview(importedCandles, importMeta)
        if (isMetatraderImport(importMeta) && source1m.length) {
          set({ importedSourceCandles: source1m })
        }
        set({ sessionReport, driverPane: 'primary' })
        if (get().chartSplit) {
          void loadSecondaryLiveCandles()
        }
        return
      }

      resetReplayState()
      set({ sessionReport, driverPane: 'primary' })
      void get().loadCandles()
    },

    play() {
      if (get().mode !== 'replay') return
      if (driverEnded()) return
      if (get().replayLoading || get().secondaryLoading) return

      engine.play()
      if (get().chartSplit) secondaryEngine.play()
      if (get().replayMessage?.startsWith('Paused ·')) {
        set({ replayMessage: null })
      }
      publishStatus()
      startClock()
      void maybePrefetch()
      void maybePrefetchSecondary()
    },

    pause() {
      pausePlayback()
    },

    setPauseOnTpSl(value) {
      persistPauseOnTpSl(value)
      set({ pauseOnTpSl: value })
    },

    stepForward() {
      if (get().mode !== 'replay') return
      if (get().replayLoading || get().secondaryLoading) return

      stopClock()
      engine.pause()
      secondaryEngine.pause()
      set({ isPlaying: false })

      advanceDriverForward()
      if (driverEnded()) {
        set({ replayStatus: 'ended', isPlaying: false })
      }
    },

    stepBackward() {
      if (get().mode !== 'replay') return
      if (get().replayLoading || get().secondaryLoading) return

      stopClock()
      retreatDriverBackward()
      publishStatus()
    },

    setSpeed(speed) {
      engine.setSpeed(speed)
      secondaryEngine.setSpeed(speed)
      const next = engine.getState().speed
      const { mode, isPlaying } = get()
      set({ speed: next })

      if (mode === 'replay' && isPlaying) {
        engine.play()
        if (get().chartSplit) secondaryEngine.play()
        startClock()
      }
    },

    seekToIndex(index) {
      if (get().mode !== 'replay') return
      stopClock()
      engine.seekToIndex(index)
      publishReplay('replace', { fitContent: false })
      syncSecondaryToPrimaryCover({ fitContent: false })
    },

    seekToTime(timeSeconds) {
      if (get().mode !== 'replay') return
      stopClock()
      engine.seekToTime(timeSeconds)
      publishReplay('replace', { fitContent: false })
      syncSecondaryToPrimaryCover({ fitContent: false })
    }
  }
})
