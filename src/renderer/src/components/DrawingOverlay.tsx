import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject
} from 'react'
import {
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time
} from 'lightweight-charts'
import { ViewportBumpPrimitive } from '@/lib/chart/viewportBumpPrimitive'
import { readOverlayViewport, sameOverlayViewport } from '@/lib/chart/overlayViewport'
import DrawingStyleWidget from '@/components/DrawingStyleWidget'
import Tooltip from '@/components/Tooltip'
import {
  drawingToolType,
  fibLevelsOf,
  isPositionDrawing,
  isPositionTool,
  isThreePointTool,
  isTwoPointTool,
  isValidPositionLevel,
  mirrorPositionLevel,
  defaultPositionLevels,
  resolvedPositionLevels,
  positionLimitPlacementBlock,
  positionLimitPlacementHint,
  positionPendingChipLabel,
  POSITION_SPAN_MAX,
  POSITION_SPAN_MIN,
  translateDrawing,
  updateFibChannelHandle as updateFibChannelHandleGeom,
  updateRectHandle as updateRectHandleGeom,
  updateTwoPointEndpoint as updateTwoPointEndpointGeom,
  type Drawing,
  type DrawingStyle,
  type Endpoint,
  type FibChannelHandle,
  type PositionDrawing,
  type PositionLevel,
  type RectHandle,
  type TrendPoint,
  type TwoPointTool
} from '@/lib/chart/drawingGeometry'
import {
  isTimeInSeriesRange,
  logicalToX,
  unixTimeToLogical,
  xToUnixTime
} from '@/lib/chart/drawingTimeScale'
import { clampXToPlot, isInPlotX, plotRightX } from '@/lib/chart/drawingPlotBounds'
import {
  DRAW_STROKE,
  DRAW_WIDTH,
  FibChannelShape,
  FibShape,
  fibChannelLevelsAt,
  fibLevelsAt,
  HANDLE_FILL,
  HANDLE_STROKE,
  HLineShape,
  POS_BADGE_INSET,
  PositionShape,
  posBadgeWidth,
  positionLevelLabel,
  RectShape,
  TrendLineShape,
  type Point
} from '@/components/DrawingShapes'
import {
  formatPnlUsd,
  formatRiskReward,
  formatTradeSizeForSymbol,
  isPendingTicketType,
  isValidPendingPrice,
  isValidPendingStopLoss,
  isValidStopLoss,
  isValidTakeProfit,
  inferTicketSide,
  linkedTicketOpposite,
  pendingKindForEntry,
  pendingToPosition,
  pnlForSide,
  pnlScaleForSymbol,
  realizedRiskReward,
  resolvedPendingKind,
  stopLossFromTakeProfit,
  takeProfitFromStopLoss,
  unrealizedPnl
} from '@/lib/paperTrade'
import { OVERLAY_LAYOUT, TRADE_OVERLAY } from '@/lib/tradeOverlayStyles'
import { CHART_PALETTES } from '@/lib/theme'
import { alignTimeToInterval, DEFAULT_TIMEFRAME, TIMEFRAMES } from '@shared/timeframes'
import type { Candle } from '@shared/candleUtils'
import { DEFAULT_PRICE_PRECISION } from '@shared/pricePrecision'
import { resolveChartPalette, useChartSettingsStore } from '@/store/chartSettingsStore'
import { useDrawingSettingsStore } from '@/store/drawingSettingsStore'
import { selectPriceFollowCandle, useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { useThemeStore } from '@/store/themeStore'
import type { PendingOrder, Position } from '@/lib/paperTrade'

type WorkingOverlayItem = {
  id: string
  working: Position
  isPending: boolean
  pendingKind?: PendingOrder['kind']
}

function workingItemsFrom(
  positions: Position[],
  pendingOrders: PendingOrder[]
): WorkingOverlayItem[] {
  return [
    ...positions.map((p) => ({ id: p.id, working: p, isPending: false })),
    ...pendingOrders.map((p) => ({
      id: p.id,
      working: pendingToPosition(p, p.placedTime),
      isPending: true,
      pendingKind: p.kind
    }))
  ]
}

function lookupWorking(
  positions: Position[],
  pendingOrders: PendingOrder[],
  id: string | null | undefined
): WorkingOverlayItem | null {
  if (!id) return null
  return workingItemsFrom(positions, pendingOrders).find((item) => item.id === id) ?? null
}

type BodyOrigin = { drawing: Drawing; time: number; price: number }

type DragState =
  | { kind: 'hline'; id: string; moved: boolean }
  | {
      kind: 'trend'
      id: string
      end: Endpoint | 'body'
      moved: boolean
      origin?: BodyOrigin
    }
  | {
      kind: 'fib'
      id: string
      end: Endpoint | 'body'
      moved: boolean
      origin?: BodyOrigin
    }
  | {
      kind: 'fibchannel'
      id: string
      end: FibChannelHandle | 'body'
      moved: boolean
      origin?: BodyOrigin
    }
  | {
      kind: 'rect'
      id: string
      handle: RectHandle | 'body'
      moved: boolean
      origin?: BodyOrigin
    }
  | {
      kind: 'pos'
      id: string
      end: 'body'
      moved: boolean
      origin?: BodyOrigin
    }
  | { kind: 'pos-level'; id: string; level: PositionLevel; moved: boolean }
  | {
      kind: 'pos-entry'
      id: string
      moved: boolean
      /** Decided on first movement: horizontal → span, vertical → entry price. */
      axis: 'pending' | 'entry' | 'span'
      startX: number
      startY: number
    }
  | { kind: 'pos-place'; id: string; level: PositionLevel; moved: boolean }
  | {
      kind: 'place-two'
      tool: TwoPointTool | 'fibchannel'
      startX: number
      startY: number
      moved: boolean
    }
  | { kind: 'tp' | 'sl'; mode: 'place' | 'move'; moved: boolean; workingId: string }
  | { kind: 'pending'; moved: boolean; workingId: string }
  | {
      kind: 'draft'
      level: 'limit' | 'tp' | 'sl'
      moved: boolean
      linkRr: boolean
      rrSource?: 'tp' | 'sl'
    }

function wantsClone(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey
}

type LevelPreview = {
  kind: 'tp' | 'sl'
  price: number
  y: number
  linkedPrice: number | null
  linkedY: number | null
}

/** Live preview while placing a position level with its 1:1 mirrored opposite. */
type PosPreview = {
  id: string
  level: PositionLevel
  price: number
  y: number
  mirrorPrice: number | null
  mirrorY: number | null
}

/** Position box spans this many bars right of the entry anchor. */
const POSITION_BOX_MIN_W = 140
/** Minimum visible box height (px) when no TP/SL is armed yet. */
const POSITION_BOX_MIN_H = 26
/** "Place Buy/Sell Limit" chip shown above a selected position drawing. */
const PLACE_LIMIT_CHIP_W = 148
const PLACE_LIMIT_CHIP_H = 22
/** Vertical gap (px) between the box top edge and the chip. */
const PLACE_LIMIT_CHIP_GAP = 26

type DrawingOverlayProps = {
  chart: IChartApi | null
  series: ISeriesApi<SeriesType> | null
  /** Pane timeframe — used to map shared drawing/trade times onto this chart. */
  paneTimeframe?: string
  /** This pane's playhead candle (for X placement on this time scale). */
  paneCurrentCandle?: Candle | null
  /** Series bars on this pane — used to extrapolate times in empty chart space. */
  paneCandles?: Candle[]
  pricePrecision?: number
}

type DrawingOverlayInnerProps = {
  chart: IChartApi | null
  series: ISeriesApi<SeriesType> | null
  paneTimeframe?: string
  pricePrecision?: number
  paneCandlesRef: RefObject<Candle[]>
  paneCurrentCandleRef: RefObject<Candle | null>
}

const EMPTY_CANDLES: Candle[] = []

type OverlayPaneRefs = {
  candles: { current: Candle[] }
  current: { current: Candle | null }
}

const overlayPaneRefs = new WeakMap<IChartApi, OverlayPaneRefs>()

function selectMarkClose(
  s: Parameters<typeof selectPriceFollowCandle>[0]
): number | null {
  return selectPriceFollowCandle(s)?.close ?? null
}

function overlayHasViewportContent(): boolean {
  const s = useReplayStore.getState()
  return (
    s.drawings.length > 0 ||
    s.pendingTrend != null ||
    s.positions.length > 0 ||
    s.pendingOrders.length > 0 ||
    s.closedTrades.length > 0 ||
    s.ticketTakeProfit != null ||
    s.ticketStopLoss != null ||
    s.ticketLimitPrice != null ||
    s.pricePick != null
  )
}

function MarkCloseSubscriber({
  children
}: {
  children: (markClose: number | null) => ReactNode
}) {
  const markClose = useReplayStore(selectMarkClose)
  return <>{children(markClose)}</>
}

function LivePnlText({
  working,
  symbol,
  x,
  y
}: {
  working: Position
  symbol: string
  x: number
  y: number
}) {
  const markClose = useReplayStore(selectMarkClose)
  const pnl = unrealizedPnl(working, markClose, pnlScaleForSymbol(symbol, working.lots))
  const color =
    pnl == null
      ? TRADE_OVERLAY.handleTextMuted
      : pnl >= 0
        ? TRADE_OVERLAY.pnlProfit
        : TRADE_OVERLAY.pnlLoss
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill={color}
      fontSize={10}
      fontFamily={TRADE_OVERLAY.font}
      fontWeight={600}
      className="pointer-events-none select-none"
    >
      {formatPnlUsd(pnl)}
    </text>
  )
}

function PositionLimitChip({
  drawing,
  origin,
  visibleRange
}: {
  drawing: PositionDrawing
  origin: { x: number; y: number }
  visibleRange: { from: number; to: number } | null
}) {
  const mark = useReplayStore(selectMarkClose)
  const pendingKind =
    mark != null ? pendingKindForEntry(drawing.type, mark, drawing.entry) : null
  const block = positionLimitPlacementBlock(drawing, {
    hasMark: mark != null,
    markPrice: mark,
    visibleRange
  })
  const hint = positionLimitPlacementHint(block, drawing.type, pendingKind)
  const label = positionPendingChipLabel(drawing.type, pendingKind)
  const levels = resolvedPositionLevels(drawing, visibleRange)

  return (
    <div
      className="absolute z-[30]"
      style={{
        left: origin.x,
        top: origin.y,
        width: PLACE_LIMIT_CHIP_W,
        height: PLACE_LIMIT_CHIP_H
      }}
    >
      <Tooltip side="top" className="h-full w-full" text={hint}>
        <button
          type="button"
          disabled={block != null}
          onClick={() => {
            if (block != null || pendingKind == null) return
            const target = levels.target
            const stop = levels.stop
            if (target == null || stop == null) return
            const store = useReplayStore.getState()
            store.placeLimit(drawing.type, drawing.entry, pendingKind)
            const created = useReplayStore.getState().pendingOrders.at(-1)
            if (created) {
              store.setTakeProfit(target, { linkRr: false, id: created.id })
              store.setStopLoss(stop, { linkRr: false, id: created.id })
            }
            store.selectDrawing(null)
          }}
          className="flex h-full w-full items-center justify-center rounded-sm border px-2 text-[10px] font-bold text-white transition-colors enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            borderColor: block != null ? '#52525b' : '#f59e0b',
            background:
              block != null ? 'rgba(39, 39, 42, 0.92)' : 'rgba(180, 83, 9, 0.95)'
          }}
        >
          {label}
        </button>
      </Tooltip>
    </div>
  )
}

function linkedLevelForDrag(
  kind: 'tp' | 'sl',
  price: number,
  side: 'long' | 'short',
  entryPrice: number,
  riskReward: number,
  series: ISeriesApi<SeriesType>
): Pick<LevelPreview, 'linkedPrice' | 'linkedY'> {
  const linkedPrice =
    kind === 'sl'
      ? takeProfitFromStopLoss(side, entryPrice, price, riskReward)
      : stopLossFromTakeProfit(side, entryPrice, price, riskReward)
  if (linkedPrice == null) return { linkedPrice: null, linkedY: null }
  const linkedY = series.priceToCoordinate(linkedPrice)
  return {
    linkedPrice,
    linkedY: linkedY == null ? null : linkedY
  }
}

function arrowHeadPoints(from: Point, to: Point, size = 7): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const bx = to.x - ux * size
  const by = to.y - uy * size
  const px = -uy * (size * 0.55)
  const py = ux * (size * 0.55)
  return `${to.x},${to.y} ${bx + px},${by + py} ${bx - px},${by - py}`
}

function estimatePnlWidth(label: string): number {
  // Tabular-ish estimate for overlay labels; keeps SVG layout free of DOM measure.
  return Math.max(OVERLAY_LAYOUT.pnlMinW, 10 + label.length * 6.2)
}

function estimateQtyWidth(label: string): number {
  return Math.max(OVERLAY_LAYOUT.qtyW, 12 + label.length * 6.4)
}

function crosshairDasharray(style: LineStyle): string | undefined {
  switch (style) {
    case LineStyle.Dotted:
      return '2 3'
    case LineStyle.Dashed:
      return '6 4'
    case LineStyle.LargeDashed:
      return '8 6'
    case LineStyle.SparseDotted:
      return '1 4'
    default:
      return undefined
  }
}

/** Drive axis labels from overlay coords so the price stays visible while drawing. */
function setDrawingCrosshair(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  x: number,
  y: number,
  candles: Candle[],
  intervalSeconds: number
): void {
  const price = series.coordinateToPrice(y)
  if (price == null || !Number.isFinite(price)) return
  const time =
    chart.timeScale().coordinateToTime(x) ??
    xToUnixTime(chart, x, candles, intervalSeconds) ??
    candles[candles.length - 1]?.time
  if (time == null) return
  chart.setCrosshairPosition(price, time as Time, series)
}

function CloseGlyph({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  const s = 3.5
  return (
    <g className="pointer-events-none" stroke={color} strokeWidth={1.6} strokeLinecap="round">
      <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} />
      <line x1={cx + s} y1={cy - s} x2={cx - s} y2={cy + s} />
    </g>
  )
}

/** SVG drawing layer synced to lightweight-charts pan/zoom. */
const DrawingOverlayInner = memo(function DrawingOverlayInner({
  chart,
  series,
  paneTimeframe,
  pricePrecision = DEFAULT_PRICE_PRECISION,
  paneCandlesRef,
  paneCurrentCandleRef
}: DrawingOverlayInnerProps) {
  const drawings = useReplayStore((s) => s.drawings)
  const drawTool = useReplayStore((s) => s.drawTool)
  const pendingTrend = useReplayStore((s) => s.pendingTrend)
  const pendingTrendEnd = useReplayStore((s) => s.pendingTrendEnd)
  const selectedDrawingId = useReplayStore((s) => s.selectedDrawingId)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const positions = useReplayStore((s) => s.positions)
  const pendingOrders = useReplayStore((s) => s.pendingOrders)
  const selectedWorkingId = useReplayStore((s) => s.selectedWorkingId)
  const selectWorking = useReplayStore((s) => s.selectWorking)
  const riskReward = useReplayStore((s) => s.riskReward)
  const addHorizontalLine = useReplayStore((s) => s.addHorizontalLine)
  const addTwoPoint = useReplayStore((s) => s.addTwoPoint)
  const addFibChannelPoint = useReplayStore((s) => s.addFibChannelPoint)
  const addPosition = useReplayStore((s) => s.addPosition)
  const updatePositionLevel = useReplayStore((s) => s.updatePositionLevel)
  const cloneDrawing = useReplayStore((s) => s.cloneDrawing)
  const replaceDrawing = useReplayStore((s) => s.replaceDrawing)
  const updateDrawingStyle = useReplayStore((s) => s.updateDrawingStyle)
  const deleteDrawing = useReplayStore((s) => s.deleteDrawing)
  const setDrawTool = useReplayStore((s) => s.setDrawTool)
  const selectDrawing = useReplayStore((s) => s.selectDrawing)
  const setTakeProfit = useReplayStore((s) => s.setTakeProfit)
  const setStopLoss = useReplayStore((s) => s.setStopLoss)
  const paperClose = useReplayStore((s) => s.paperClose)
  const cancelPending = useReplayStore((s) => s.cancelPending)
  const setPendingPrice = useReplayStore((s) => s.setPendingPrice)
  const pricePick = useReplayStore((s) => s.pricePick)
  const applyPricePick = useReplayStore((s) => s.applyPricePick)
  const setPricePick = useReplayStore((s) => s.setPricePick)
  const ticketOrderType = useReplayStore((s) => s.ticketOrderType)
  const ticketLimitPrice = useReplayStore((s) => s.ticketLimitPrice)
  const ticketTakeProfit = useReplayStore((s) => s.ticketTakeProfit)
  const ticketStopLoss = useReplayStore((s) => s.ticketStopLoss)
  const setTicketLimitPrice = useReplayStore((s) => s.setTicketLimitPrice)
  const setTicketTakeProfit = useReplayStore((s) => s.setTicketTakeProfit)
  const setTicketStopLoss = useReplayStore((s) => s.setTicketStopLoss)
  const mode = useReplayStore((s) => s.mode)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const symbol = useReplayStore((s) => s.symbol)
  const theme = useThemeStore((s) => s.theme)
  const chrome = CHART_PALETTES[theme]
  const colorOverrides = useChartSettingsStore((s) => s.colors)
  const crosshairSettings = useChartSettingsStore((s) => s.crosshair)
  const palette = resolveChartPalette(theme, colorOverrides)
  const toolDefaults = useDrawingSettingsStore((s) => s.toolDefaults)
  const widgetFields = useDrawingSettingsStore((s) => s.widgetFields)
  const fibLevelDefaults = useDrawingSettingsStore((s) => s.fibLevels)
  const setDrawingDialogOpen = useDrawingSettingsStore((s) => s.setDrawingDialogOpen)
  const widgetPos = useUiLayoutStore((s) => s.drawingWidgetPos)
  const setWidgetPos = useUiLayoutStore((s) => s.setDrawingWidgetPos)

  const onSelectedStyleChange = useCallback(
    (patch: Partial<DrawingStyle>) => {
      const id = useReplayStore.getState().selectedDrawingId
      if (!id) return
      updateDrawingStyle(id, patch)
    },
    [updateDrawingStyle]
  )

  const onSelectedPreset = useCallback((presetId: string) => {
    const drawing = useReplayStore.getState().drawings.find((d) => d.id === useReplayStore.getState().selectedDrawingId)
    if (!drawing) return
    const tool = drawingToolType(drawing)
    const preset = useDrawingSettingsStore.getState().presets[tool].find((p) => p.id === presetId)
    if (!preset) return
    updateDrawingStyle(drawing.id, {
      color: preset.color,
      lineWidth: preset.lineWidth,
      lineStyle: preset.lineStyle,
      fillColor: preset.fillColor,
      tpColor: preset.tpColor,
      slColor: preset.slColor
    })
  }, [updateDrawingStyle])

  const onOpenDrawingSettings = useCallback(() => {
    setDrawingDialogOpen(true, 'widget')
  }, [setDrawingDialogOpen])

  const onDeleteSelectedDrawing = useCallback(() => {
    const id = useReplayStore.getState().selectedDrawingId
    if (!id) return
    deleteDrawing(id)
  }, [deleteDrawing])

  const intervalSeconds =
    TIMEFRAMES[paneTimeframe || '']?.seconds ?? TIMEFRAMES[DEFAULT_TIMEFRAME].seconds

  function readPlotRight(): number {
    if (!chart) return 0
    return plotRightX(
      chart.chartElement()?.clientWidth ?? 0,
      chart.priceScale('right').width(),
      chart.timeScale().width()
    )
  }

  function readVisiblePriceRange(): { from: number; to: number } | null {
    const range = chart?.priceScale('right').getVisibleRange()
    if (!range || !(range.to > range.from)) return null
    return range
  }

  function mapTimeToPane(time: number): number {
    return alignTimeToInterval(time, intervalSeconds)
  }

  function timeToX(time: number): number | null {
    if (!chart) return null
    const candles = paneCandlesRef.current ?? EMPTY_CANDLES
    const exact = chart.timeScale().timeToCoordinate(time as Time)
    if (exact != null) return exact
    // Align only for times inside a visible bar (split-pane TF mapping).
    // The last bar covers `[open, open+interval)`; a 5m exit inside the
    // current 1h candle must snap onto that bar, not into empty space after it.
    if (isTimeInSeriesRange(time, candles, intervalSeconds)) {
      const aligned = mapTimeToPane(time)
      if (aligned !== time) {
        const alignedX = chart.timeScale().timeToCoordinate(aligned as Time)
        if (alignedX != null) return alignedX
      }
    }
    const logical = unixTimeToLogical(time, candles, intervalSeconds)
    if (logical == null) return null
    return logicalToX(chart, logical)
  }

  /** Last candle whose time is at or before `time` (or null if none). */
  function lastCandleAtOrBefore(time: number): Candle | null {
    const candles = paneCandlesRef.current ?? EMPTY_CANDLES
    if (candles.length === 0) return null
    const logical = unixTimeToLogical(time, candles, intervalSeconds)
    if (logical == null) return null
    const idx = Math.min(Math.max(0, Math.floor(logical)), candles.length - 1)
    const candle = candles[idx]
    if (!candle || candle.time > time) return null
    return candle
  }

  const [version, setVersion] = useState(0)
  const [hover, setHover] = useState<Point | null>(null)
  const [hoveredDrawingId, setHoveredDrawingId] = useState<string | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [levelPreview, setLevelPreview] = useState<LevelPreview | null>(null)
  const [posPreview, setPosPreview] = useState<PosPreview | null>(null)
  const [placeHint, setPlaceHint] = useState<'tp' | 'sl' | null>(null)
  const [draftDrawing, setDraftDrawing] = useState<Drawing | null>(null)
  const [pendingPreview, setPendingPreview] = useState<{ id: string; price: number } | null>(null)
  const [ticketPreview, setTicketPreview] = useState<{
    limit?: number
    tp?: number
    sl?: number
  } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)
  const levelPreviewRef = useRef(levelPreview)
  const posPreviewRef = useRef(posPreview)
  const draftDrawingRef = useRef<Drawing | null>(null)
  const pendingPreviewRef = useRef(pendingPreview)
  const ticketPreviewRef = useRef(ticketPreview)
  const viewportRef = useRef<ReturnType<typeof readOverlayViewport> | null>(null)
  const hairHRef = useRef<SVGLineElement>(null)
  const hairVRef = useRef<SVGLineElement>(null)
  const hoverRef = useRef<Point | null>(null)
  const draftRafRef = useRef(0)
  const hoverRafRef = useRef(0)

  useEffect(() => {
    levelPreviewRef.current = levelPreview
    posPreviewRef.current = posPreview
    pendingPreviewRef.current = pendingPreview
    ticketPreviewRef.current = ticketPreview
  })

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  function publishDraft(next: Drawing | null): void {
    draftDrawingRef.current = next
    if (draftRafRef.current) return
    draftRafRef.current = requestAnimationFrame(() => {
      draftRafRef.current = 0
      setDraftDrawing(draftDrawingRef.current)
    })
  }

  function applyHaircross(point: Point | null): void {
    hoverRef.current = point
    const h = hairHRef.current
    const v = hairVRef.current
    if (!h || !v) return
    if (!point) {
      h.setAttribute('visibility', 'hidden')
      v.setAttribute('visibility', 'hidden')
      return
    }
    h.setAttribute('visibility', 'visible')
    h.setAttribute('y1', String(point.y))
    h.setAttribute('y2', String(point.y))
    v.setAttribute('visibility', 'visible')
    v.setAttribute('x1', String(point.x))
    v.setAttribute('x2', String(point.x))
  }

  function publishHover(point: Point | null, forRubberBand: boolean): void {
    applyHaircross(point)
    if (!forRubberBand) return
    if (hoverRafRef.current) return
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = 0
      setHover(hoverRef.current)
    })
  }

  function drawingById(id: string): Drawing | null {
    if (draftDrawingRef.current?.id === id) return draftDrawingRef.current
    return useReplayStore.getState().drawings.find((d) => d.id === id) ?? null
  }

  useEffect(() => {
    if (!chart || !series) return undefined

    // Coalesce LWC paints into at most one overlay reconcile per frame, and skip
    // when only the crosshair moved (plot size + visible ranges unchanged).
    let raf = 0
    const scheduleBump = (): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!overlayHasViewportContent()) return
        const next = readOverlayViewport(chart)
        if (sameOverlayViewport(viewportRef.current, next)) return
        viewportRef.current = next
        bump()
      })
    }

    const primitive = new ViewportBumpPrimitive(scheduleBump)
    series.attachPrimitive(primitive)

    const ro = new ResizeObserver(scheduleBump)
    const el = chart.chartElement()
    if (el) ro.observe(el)

    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(draftRafRef.current)
      cancelAnimationFrame(hoverRafRef.current)
      series.detachPrimitive(primitive)
      ro.disconnect()
    }
  }, [chart, series, bump])

  const canEditTrade = mode === 'replay' && replayStatus !== 'ended'
  const canDraw = !(mode === 'replay' && replayStatus === 'ended')
  const canSelect = canDraw && drawTool === 'select'

  // Clicks that reach the chart canvas (empty space) clear the current selection.
  // Clicks on drawing elements stop propagation, so they never hit the canvas.
  useEffect(() => {
    if (!chart || !canSelect) return undefined
    const handler = (): void => {
      selectDrawing(null)
    }
    chart.subscribeClick(handler)
    return () => chart.unsubscribeClick(handler)
  }, [chart, canSelect, selectDrawing])

  const placing =
    canDraw &&
    (drawTool === 'hline' ||
      isTwoPointTool(drawTool) ||
      isThreePointTool(drawTool) ||
      isPositionTool(drawTool) ||
      pricePick != null)

  // Overlay captures pointer events while placing, so the chart never sees
  // mousemove — keep the native haircross (and price label) in sync ourselves.
  useEffect(() => {
    if (!placing || !chart) return undefined
    chart.applyOptions({
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { visible: false, labelVisible: true },
        horzLine: { visible: false, labelVisible: true }
      }
    })
    return () => {
      const next = useChartSettingsStore.getState().crosshair
      chart.applyOptions({
        crosshair: {
          mode: next.mode,
          vertLine: { visible: next.visible, labelVisible: next.labelVisible },
          horzLine: { visible: next.visible, labelVisible: next.labelVisible }
        }
      })
      chart.clearCrosshairPosition()
    }
  }, [placing, chart])

  // Track the pointer immediately in pick mode (mouse may already be over the chart).
  useEffect(() => {
    if (!pricePick || !chart || !series) return undefined
    const pickChart = chart
    const pickSeries = series

    function onWinMove(event: MouseEvent): void {
      const el = pickChart.chartElement()
      if (!el) return
      const rect = el.getBoundingClientRect()
      const plotRight = plotRightX(
        el.clientWidth,
        pickChart.priceScale('right').width(),
        pickChart.timeScale().width()
      )
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      if (x < 0 || y < 0 || x > plotRight || y > el.clientHeight) {
        applyHaircross(null)
        setLevelPreview(null)
        pickChart.clearCrosshairPosition()
        return
      }
      const cx = clampXToPlot(x, plotRight)
      applyHaircross({ x: cx, y })
      setDrawingCrosshair(pickChart, pickSeries, cx, y, paneCandlesRef.current ?? EMPTY_CANDLES, intervalSeconds)
      const price = pickSeries.coordinateToPrice(y)
      if (price == null || !Number.isFinite(price)) return
      const state = useReplayStore.getState()
      const item = lookupWorking(state.positions, state.pendingOrders, state.selectedWorkingId)
      const working = item?.working ?? null
      if (!working) {
        setLevelPreview(null)
        return
      }
      const kind = state.pricePick
      if (kind !== 'tp' && kind !== 'sl') {
        setLevelPreview(null)
        return
      }
      const otherMissing = kind === 'tp' ? working.stopLoss == null : working.takeProfit == null
      const linked = otherMissing
        ? linkedLevelForDrag(
            kind,
            price,
            working.side,
            working.entryPrice,
            state.riskReward,
            pickSeries
          )
        : { linkedPrice: null, linkedY: null }
      setLevelPreview({
        kind,
        price,
        y,
        linkedPrice: linked.linkedPrice,
        linkedY: linked.linkedY
      })
    }

    window.addEventListener('mousemove', onWinMove)
    return () => window.removeEventListener('mousemove', onWinMove)
  }, [pricePick, chart, series, intervalSeconds])

  // Document-level drag so handles stay under the cursor outside the SVG.
  useEffect(() => {
    if (!draggingKey || !series || !chart) return undefined

    function onMove(event: MouseEvent): void {
      const drag = dragRef.current
      if (!drag || !series || !chart) return
      const el = chart.chartElement()
      if (!el) return
      const rect = el.getBoundingClientRect()
      const plotRight = readPlotRight()
      const x = clampXToPlot(event.clientX - rect.left, plotRight)
      const y = event.clientY - rect.top
      setDrawingCrosshair(chart, series, x, y, paneCandlesRef.current ?? EMPTY_CANDLES, intervalSeconds)

      if (drag.kind === 'place-two') {
        publishHover({ x, y }, true)
        if (Math.hypot(x - drag.startX, y - drag.startY) >= 4) drag.moved = true
        return
      }

      const price = series.coordinateToPrice(y)
      if (price == null || !Number.isFinite(price)) return

      if (drag.kind === 'hline') {
        drag.moved = true
        const current = drawingById(drag.id)
        if (current?.type === 'hline') publishDraft({ ...current, price })
        return
      }

      if (drag.kind === 'pos') {
        const timeSec = xToUnixTime(chart, x, paneCandlesRef.current ?? EMPTY_CANDLES, intervalSeconds)
        if (timeSec == null) return
        const origin = drag.origin
        if (!origin) return
        drag.moved = true
        publishDraft(translateDrawing(origin.drawing, timeSec - origin.time, price - origin.price))
        return
      }

      if (drag.kind === 'pos-level') {
        const current = drawingById(drag.id)
        if (!current || !isPositionDrawing(current)) return
        if (!isValidPositionLevel(current.type, drag.level, current.entry, price)) return
        drag.moved = true
        publishDraft(
          drag.level === 'target' ? { ...current, target: price } : { ...current, stop: price }
        )
        return
      }

      if (drag.kind === 'pos-entry') {
        // First few pixels decide the drag axis from the entry circle:
        // horizontal → resize span, vertical → move the entry price.
        if (drag.axis === 'pending') {
          const dx = event.clientX - drag.startX
          const dy = event.clientY - drag.startY
          if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
          drag.axis = Math.abs(dx) > Math.abs(dy) ? 'span' : 'entry'
          drag.moved = true
        }
        const current = drawingById(drag.id)
        if (!current || !isPositionDrawing(current)) return
        if (drag.axis === 'span') {
          const timeSec = xToUnixTime(chart, x, paneCandlesRef.current ?? EMPTY_CANDLES, intervalSeconds)
          if (timeSec == null) return
          const span = (timeSec - current.t) / intervalSeconds
          const clamped = Math.max(POSITION_SPAN_MIN, Math.min(POSITION_SPAN_MAX, Math.round(span)))
          publishDraft({ ...current, span: clamped })
          return
        }
        publishDraft({ ...current, entry: price })
        return
      }

      if (drag.kind === 'pos-place') {
        drag.moved = true
        const state = useReplayStore.getState()
        const drawing = state.drawings.find((d) => d.id === drag.id)
        if (!drawing || !isPositionDrawing(drawing)) return
        if (!isValidPositionLevel(drawing.type, drag.level, drawing.entry, price)) return
        const opposite: PositionLevel = drag.level === 'target' ? 'stop' : 'target'
        const mirror =
          drawing[opposite] == null
            ? mirrorPositionLevel(drawing.type, drawing.entry, drag.level, price)
            : null
        const preview = {
          id: drag.id,
          level: drag.level,
          price,
          y,
          mirrorPrice: mirror,
          mirrorY: mirror == null ? null : (series.priceToCoordinate(mirror) ?? null)
        }
        posPreviewRef.current = preview
        setPosPreview(preview)
        return
      }

      if (drag.kind === 'pending') {
        drag.moved = true
        const state = useReplayStore.getState()
        const pending = state.pendingOrders.find((p) => p.id === drag.workingId)
        const mark = state.currentCandle?.close
        if (!pending || mark == null) return
        if (isValidPendingPrice(resolvedPendingKind(pending.kind), pending.side, mark, price)) {
          selectWorking(pending.id)
          const preview = { id: pending.id, price }
          pendingPreviewRef.current = preview
          setPendingPreview(preview)
        }
        return
      }

      if (drag.kind === 'draft') {
        drag.moved = true
        const state = useReplayStore.getState()
        const prev = ticketPreviewRef.current ?? {}
        if (drag.level === 'limit') {
          const next = { ...prev, limit: price }
          if (drag.linkRr && drag.rrSource === 'sl' && state.ticketStopLoss != null) {
            const linkedTp = linkedTicketOpposite(
              'sl',
              state.ticketStopLoss,
              price,
              state.riskReward
            )
            if (linkedTp != null) next.tp = linkedTp
          } else if (drag.linkRr && drag.rrSource === 'tp' && state.ticketTakeProfit != null) {
            const linkedSl = linkedTicketOpposite(
              'tp',
              state.ticketTakeProfit,
              price,
              state.riskReward
            )
            if (linkedSl != null) next.sl = linkedSl
          }
          ticketPreviewRef.current = next
          setTicketPreview(next)
          return
        }
        const entry = isPendingTicketType(state.ticketOrderType)
          ? (prev.limit ?? state.ticketLimitPrice)
          : (state.currentCandle?.close ?? null)
        if (drag.level === 'tp') {
          const next = { ...prev, tp: price }
          if (drag.linkRr && entry != null) {
            const linkedSl = linkedTicketOpposite('tp', price, entry, state.riskReward)
            if (linkedSl != null) next.sl = linkedSl
          }
          ticketPreviewRef.current = next
          setTicketPreview(next)
          return
        }
        const next = { ...prev, sl: price }
        if (drag.linkRr && entry != null) {
          const linkedTp = linkedTicketOpposite('sl', price, entry, state.riskReward)
          if (linkedTp != null) next.tp = linkedTp
        }
        ticketPreviewRef.current = next
        setTicketPreview(next)
        return
      }

      if (drag.kind === 'tp' || drag.kind === 'sl') {
        drag.moved = true
        const state = useReplayStore.getState()
        const item = lookupWorking(state.positions, state.pendingOrders, drag.workingId)
        const working = item?.working ?? null
        selectWorking(drag.workingId)
        const linked =
          drag.mode === 'place' && working != null
            ? linkedLevelForDrag(
                drag.kind,
                price,
                working.side,
                working.entryPrice,
                state.riskReward,
                series
              )
            : { linkedPrice: null, linkedY: null }
        const preview = {
          kind: drag.kind,
          price,
          y,
          linkedPrice: linked.linkedPrice,
          linkedY: linked.linkedY
        }
        levelPreviewRef.current = preview
        setLevelPreview(preview)
        return
      }

      if (
        drag.kind === 'trend' ||
        drag.kind === 'fib' ||
        drag.kind === 'fibchannel' ||
        drag.kind === 'rect'
      ) {
        const timeSec = xToUnixTime(chart, x, paneCandlesRef.current ?? EMPTY_CANDLES, intervalSeconds)
        if (timeSec == null) return
        const point: TrendPoint = { time: timeSec, price }
        const current = drawingById(drag.id)
        if (!current) return
        drag.moved = true

        if (drag.kind === 'rect') {
          if (drag.handle === 'body') {
            const origin = drag.origin
            if (!origin) return
            publishDraft(translateDrawing(origin.drawing, timeSec - origin.time, price - origin.price))
            return
          }
          if (current.type !== 'rect') return
          publishDraft(updateRectHandleGeom(current, drag.handle, point))
          return
        }

        if (drag.end === 'body') {
          const origin = drag.origin
          if (!origin) return
          publishDraft(translateDrawing(origin.drawing, timeSec - origin.time, price - origin.price))
          return
        }

        if (drag.kind === 'fibchannel') {
          if (current.type !== 'fibchannel') return
          publishDraft(updateFibChannelHandleGeom(current, drag.end, point))
          return
        }

        if (current.type !== 'trendline' && current.type !== 'fib') return
        publishDraft(updateTwoPointEndpointGeom(current, drag.end, point))
      }
    }

    function onUp(event: MouseEvent): void {
      const drag = dragRef.current
      if (drag?.moved) suppressClickRef.current = true

      if (drag?.kind === 'place-two') {
        suppressClickRef.current = true
        if (drag.moved && series && chart) {
          const el = chart.chartElement()
          if (el) {
            const box = el.getBoundingClientRect()
            const plotRight = readPlotRight()
            const x = clampXToPlot(event.clientX - box.left, plotRight)
            const y = event.clientY - box.top
            const price = series.coordinateToPrice(y)
            const timeSec = xToUnixTime(chart, x, paneCandlesRef.current ?? EMPTY_CANDLES, intervalSeconds)
            if (price != null && Number.isFinite(price) && timeSec != null) {
              if (drag.tool === 'fibchannel') {
                addFibChannelPoint({ time: timeSec, price })
              } else {
                addTwoPoint({ time: timeSec, price })
              }
            } else {
              setDrawTool(drag.tool)
            }
          }
        } else if (!(drag.tool === 'fibchannel' && useReplayStore.getState().pendingTrend)) {
          setDrawTool(drag.tool)
        }
        applyHaircross(null)
        setHover(null)
      }

      if (drag && (drag.kind === 'tp' || drag.kind === 'sl') && drag.moved) {
        const preview = levelPreviewRef.current
        if (preview && preview.kind === drag.kind) {
          if (drag.mode === 'place') {
            if (drag.kind === 'tp') {
              setTakeProfit(preview.price, { linkRr: true, id: drag.workingId })
            } else {
              setStopLoss(preview.price, { linkRr: true, id: drag.workingId })
            }
          } else {
            const state = useReplayStore.getState()
            const item = lookupWorking(state.positions, state.pendingOrders, drag.workingId)
            const working = item?.working ?? null
            const pending = item?.isPending
              ? (state.pendingOrders.find((p) => p.id === drag.workingId) ?? null)
              : null
            const open = item && !item.isPending ? item.working : null
            if (working) {
              if (drag.kind === 'tp') {
                if (isValidTakeProfit(working.side, working.entryPrice, preview.price)) {
                  setTakeProfit(preview.price, { id: drag.workingId })
                }
              } else if (pending && !open) {
                if (isValidPendingStopLoss(pending.side, pending.price, preview.price)) {
                  setStopLoss(preview.price, { id: drag.workingId })
                }
              } else {
                const mark = state.currentCandle?.close
                if (mark != null && isValidStopLoss(working.side, mark, preview.price)) {
                  setStopLoss(preview.price, { id: drag.workingId })
                }
              }
            }
          }
        }
      }

      if (drag?.kind === 'pos-place') {
        suppressClickRef.current = true
        const preview = posPreviewRef.current
        if (preview && preview.id === drag.id) {
          updatePositionLevel(drag.id, drag.level, preview.price)
          if (preview.mirrorPrice != null) {
            updatePositionLevel(
              drag.id,
              drag.level === 'target' ? 'stop' : 'target',
              preview.mirrorPrice
            )
          }
        }
      }

      if (drag?.kind === 'pending' && drag.moved) {
        const preview = pendingPreviewRef.current
        if (preview && preview.id === drag.workingId) setPendingPrice(preview.price)
      }

      if (drag?.kind === 'draft' && drag.moved) {
        const preview = ticketPreviewRef.current
        if (preview) {
          if (preview.limit != null) setTicketLimitPrice(preview.limit)
          if (preview.tp != null) setTicketTakeProfit(preview.tp)
          if (preview.sl != null) setTicketStopLoss(preview.sl)
        }
      }

      if (
        drag &&
        (drag.kind === 'hline' ||
          drag.kind === 'trend' ||
          drag.kind === 'fib' ||
          drag.kind === 'fibchannel' ||
          drag.kind === 'rect' ||
          drag.kind === 'pos' ||
          drag.kind === 'pos-level' ||
          drag.kind === 'pos-entry') &&
        drag.moved &&
        draftDrawingRef.current
      ) {
        replaceDrawing(draftDrawingRef.current)
      }

      draftDrawingRef.current = null
      setDraftDrawing(null)
      pendingPreviewRef.current = null
      ticketPreviewRef.current = null
      setPendingPreview(null)
      setTicketPreview(null)
      dragRef.current = null
      setDraggingKey(null)
      setLevelPreview(null)
      setPosPreview(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [
    draggingKey,
    chart,
    series,
    updatePositionLevel,
    addTwoPoint,
    addFibChannelPoint,
    setDrawTool,
    setTakeProfit,
    setStopLoss,
    setPendingPrice,
    setTicketLimitPrice,
    setTicketTakeProfit,
    setTicketStopLoss,
    replaceDrawing,
    selectWorking,
    intervalSeconds
  ])

  function onClick(event: ReactMouseEvent<SVGSVGElement>): void {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (!placing || !series || !chart) return

    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    if (!isInPlotX(x, readPlotRight())) return
    const y = event.clientY - rect.top
    const price = series.coordinateToPrice(y)
    if (price == null || !Number.isFinite(price)) return

    if (pricePick) {
      applyPricePick(price)
      return
    }

    if (drawTool !== 'hline' && !isPositionTool(drawTool)) return
    if (isPositionTool(drawTool)) {
      const timeSec = xToUnixTime(chart, x, paneCandlesRef.current ?? EMPTY_CANDLES, intervalSeconds)
      if (timeSec == null) return
      addPosition(
        { time: timeSec, price },
        defaultPositionLevels(drawTool, price, readVisiblePriceRange()) ?? undefined
      )
      return
    }
    addHorizontalLine(price)
  }

  function onSvgMouseDown(event: ReactMouseEvent<SVGSVGElement>): void {
    if (pricePick) return
    const placingPoints = isTwoPointTool(drawTool) || isThreePointTool(drawTool)
    if (!canDraw || !placingPoints || event.button !== 0 || !chart || !series) return
    const box = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - box.left
    const y = event.clientY - box.top
    if (!isInPlotX(x, readPlotRight())) return
    const point = pointerAtEvent(event)
    if (!point) return
    event.preventDefault()
    if (drawTool === 'fibchannel') {
      addFibChannelPoint(point)
      if (useReplayStore.getState().drawTool !== 'fibchannel') return
    } else {
      addTwoPoint(point)
    }
    dragRef.current = { kind: 'place-two', tool: drawTool, startX: x, startY: y, moved: false }
    publishHover({ x, y }, true)
    setDrawingCrosshair(chart, series, x, y, paneCandlesRef.current ?? EMPTY_CANDLES, intervalSeconds)
    setDraggingKey('place-two')
  }

  function onMove(event: ReactMouseEvent<SVGSVGElement>): void {
    if (!placing || !chart || !series) {
      applyHaircross(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const plotRight = readPlotRight()
    const x = clampXToPlot(event.clientX - rect.left, plotRight)
    const y = event.clientY - rect.top
    const rubber =
      Boolean(useReplayStore.getState().pendingTrend) || dragRef.current?.kind === 'place-two'
    publishHover({ x, y }, rubber)
    setDrawingCrosshair(chart, series, x, y, paneCandlesRef.current ?? EMPTY_CANDLES, intervalSeconds)

    if (!pricePick || (pricePick !== 'tp' && pricePick !== 'sl')) {
      if (pricePick === 'limit') setLevelPreview(null)
      return
    }
    const price = series.coordinateToPrice(y)
    if (price == null || !Number.isFinite(price)) return
    const working =
      lookupWorking(positions, pendingOrders, selectedWorkingId)?.working ?? null
    if (!working) {
      setLevelPreview(null)
      return
    }
    const otherMissing = pricePick === 'tp' ? working.stopLoss == null : working.takeProfit == null
    const linked = otherMissing
      ? linkedLevelForDrag(pricePick, price, working.side, working.entryPrice, riskReward, series)
      : { linkedPrice: null, linkedY: null }
    setLevelPreview({
      kind: pricePick,
      price,
      y,
      linkedPrice: linked.linkedPrice,
      linkedY: linked.linkedY
    })
  }

  function pointerAtEvent(event: ReactMouseEvent): TrendPoint | null {
    if (!chart || !series) return null
    const el = chart.chartElement()
    if (!el) return null
    const box = el.getBoundingClientRect()
    const x = event.clientX - box.left
    const y = event.clientY - box.top
    const plotRight = readPlotRight()
    if (!isInPlotX(x, plotRight)) return null
    const price = series.coordinateToPrice(y)
    const time = xToUnixTime(chart, clampXToPlot(x, plotRight), paneCandlesRef.current ?? EMPTY_CANDLES, intervalSeconds)
    if (price == null || !Number.isFinite(price) || time == null) return null
    return { time, price }
  }

  function startDrag(event: ReactMouseEvent, next: DragState): void {
    if (pricePick) return
    const isDrawingDrag =
      next.kind === 'hline' ||
      next.kind === 'trend' ||
      next.kind === 'fib' ||
      next.kind === 'fibchannel' ||
      next.kind === 'rect' ||
      next.kind === 'pos' ||
      next.kind === 'pos-level' ||
      next.kind === 'pos-entry' ||
      next.kind === 'pos-place'
    const allowed = isDrawingDrag ? canDraw : canEditTrade
    if (!allowed) return
    event.preventDefault()
    event.stopPropagation()

    let drag: DragState = next
    if (isDrawingDrag) {
      const isBody =
        next.kind === 'hline' ||
        (next.kind === 'rect' && next.handle === 'body') ||
        ((next.kind === 'trend' ||
          next.kind === 'fib' ||
          next.kind === 'fibchannel' ||
          next.kind === 'pos') &&
          next.end === 'body')

      let id = next.id
      if (isBody && wantsClone(event)) {
        id = cloneDrawing(id) ?? id
      }

      if (isBody && next.kind !== 'hline') {
        const originPt = pointerAtEvent(event)
        const drawing = useReplayStore.getState().drawings.find((d) => d.id === id)
        if (!originPt || !drawing) return
        drag = {
          ...next,
          id,
          origin: { drawing, time: originPt.time, price: originPt.price }
        }
      } else {
        drag = { ...next, id }
      }
    }

    dragRef.current = drag
    if (
      'id' in drag &&
      typeof drag.id === 'string' &&
      drag.kind !== 'pos-place'
    ) {
      const seeded = useReplayStore.getState().drawings.find((d) => d.id === drag.id)
      if (seeded) {
        draftDrawingRef.current = seeded
        setDraftDrawing(seeded)
      }
    }
    if (drag.kind === 'hline') {
      setDraggingKey(`hline:${drag.id}`)
    } else if (drag.kind === 'trend' || drag.kind === 'fib' || drag.kind === 'fibchannel') {
      setDraggingKey(`${drag.kind}:${drag.id}:${drag.end}`)
    } else if (drag.kind === 'rect') {
      setDraggingKey(`rect:${drag.id}:${drag.handle}`)
    } else if (drag.kind === 'pos') {
      setDraggingKey(`pos:${drag.id}:${drag.end}`)
    } else if (drag.kind === 'pos-level') {
      setDraggingKey(`pos-level:${drag.id}:${drag.level}`)
    } else if (drag.kind === 'pos-entry') {
      setDraggingKey(`pos-entry:${drag.id}`)
    } else if (drag.kind === 'pos-place') {
      setDraggingKey(`pos-place:${drag.id}:${drag.level}`)
      // Seed preview immediately at the entry handle Y so the guide appears on drag start.
      const drawing = useReplayStore.getState().drawings.find((d) => d.id === drag.id)
      if (drawing && isPositionDrawing(drawing) && series) {
        const entryY = series.priceToCoordinate(drawing.entry)
        if (entryY != null) {
          setPosPreview({
            id: drag.id,
            level: drag.level,
            price: drawing.entry,
            y: entryY,
            mirrorPrice: null,
            mirrorY: null
          })
        }
      }
    } else if (drag.kind === 'place-two') {
      setDraggingKey('place-two')
    } else if (drag.kind === 'pending') {
      setDraggingKey(`pending:${drag.workingId}`)
    } else if (drag.kind === 'draft') {
      setDraggingKey(`draft:${drag.level}`)
    } else {
      setDraggingKey(`${drag.kind}:${drag.mode}:${drag.workingId}`)
      setPlaceHint(null)
      // Seed preview immediately at the entry handle Y so the line appears on drag start.
      const state = useReplayStore.getState()
      const working =
        lookupWorking(state.positions, state.pendingOrders, drag.kind === 'tp' || drag.kind === 'sl' || drag.kind === 'pending' ? drag.workingId : state.selectedWorkingId)?.working ?? null
      if (series && working) {
        const seedY = series.priceToCoordinate(working.entryPrice)
        if (seedY != null) {
          const linked =
            drag.mode === 'place'
              ? linkedLevelForDrag(
                  drag.kind,
                  working.entryPrice,
                  working.side,
                  working.entryPrice,
                  riskReward,
                  series
                )
              : { linkedPrice: null, linkedY: null }
          setLevelPreview({
            kind: drag.kind,
            price: working.entryPrice,
            y: seedY,
            linkedPrice: linked.linkedPrice,
            linkedY: linked.linkedY
          })
        }
      }
    }
  }

  function stopAction(event: ReactMouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = true
  }

  function selectDrawingOnClick(event: ReactMouseEvent, id: string): void {
    if (pricePick) return
    // A finished drag on a handle also emits a click — ignore those.
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    event.stopPropagation()
    selectDrawing(id)
  }

  // Touch version so React doesn't drop redraw deps for lint.
  void version

  const shownDrawings = draftDrawing
    ? drawings.map((d) => (d.id === draftDrawing.id ? draftDrawing : d))
    : drawings
  const liveLimit = ticketPreview?.limit ?? ticketLimitPrice
  const liveTp = ticketPreview?.tp ?? ticketTakeProfit
  const liveSl = ticketPreview?.sl ?? ticketStopLoss

  const width = chart?.chartElement()?.clientWidth ?? 0
  const height = chart?.chartElement()?.clientHeight ?? 0
  const priceScaleW = chart?.priceScale('right').width() ?? 56
  const plotRight = plotRightX(width, priceScaleW, chart?.timeScale().width() ?? 0)
  const midX = plotRight / 2
  const workingOverlays = workingItemsFrom(positions, pendingOrders)
  const selectedItem = lookupWorking(positions, pendingOrders, selectedWorkingId)
  const working = selectedItem?.working ?? null
  const isPending = selectedItem?.isPending ?? false

  function toXY(time: number, price: number): Point | null {
    if (!chart || !series) return null
    const x = timeToX(time)
    const y = series.priceToCoordinate(price)
    if (x == null || y == null) return null
    return { x, y }
  }

  /** Anchor point used to place the floating style widget near a drawing. */
  function drawingAnchor(drawing: Drawing): Point | null {
    if (drawing.type === 'hline') {
      const y = series?.priceToCoordinate(drawing.price)
      return y == null ? null : { x: midX, y }
    }
    if (isPositionDrawing(drawing)) {
      const x = timeToX(drawing.t)
      const y = series?.priceToCoordinate(drawing.entry)
      return x == null || y == null ? null : { x, y }
    }
    const a = toXY(drawing.t1, drawing.p1)
    const b = toXY(drawing.t2, drawing.p2)
    if (!a || !b) return null
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }

  const selectedDrawing = shownDrawings.find((d) => d.id === selectedDrawingId) ?? null
  const selectedAnchor = selectedDrawing ? drawingAnchor(selectedDrawing) : null
  const selectedStyle: DrawingStyle | null =
    selectedDrawing != null
      ? (selectedDrawing.style ?? toolDefaults[drawingToolType(selectedDrawing)])
      : null
  const selectedFields =
    selectedDrawing != null ? widgetFields[drawingToolType(selectedDrawing)] : null

  /** Top-left corner of the place-limit chip for a position drawing, or null. */
  function positionChipOrigin(drawing: PositionDrawing): { x: number; y: number } | null {
    const anchor = toXY(drawing.t, drawing.entry)
    if (!anchor || !series) return null

    let targetPrice: number | null = drawing.target
    let stopPrice: number | null = drawing.stop
    if (targetPrice == null || stopPrice == null) {
      const defaults = defaultPositionLevels(drawing.type, drawing.entry, readVisiblePriceRange())
      if (targetPrice == null) targetPrice = defaults?.target ?? null
      if (stopPrice == null) stopPrice = defaults?.stop ?? null
    }
    const targetY: number | null =
      targetPrice == null ? null : (series.priceToCoordinate(targetPrice) ?? null)
    const stopY: number | null =
      stopPrice == null ? null : (series.priceToCoordinate(stopPrice) ?? null)

    const levelYs = [anchor.y, targetY, stopY].filter((y): y is number => y != null)
    let topY = Math.min(...levelYs)
    let bottomY = Math.max(...levelYs)
    if (bottomY - topY < POSITION_BOX_MIN_H) {
      const mid = (bottomY + topY) / 2
      topY = mid - POSITION_BOX_MIN_H / 2
      bottomY = mid + POSITION_BOX_MIN_H / 2
    }

    const boxRightTime = drawing.t + intervalSeconds * drawing.span
    const boxLeft = anchor.x
    const tpLabel =
      targetPrice == null
        ? null
        : positionLevelLabel(targetPrice, drawing.entry, drawing.type, pricePrecision)
    const slLabel =
      stopPrice == null
        ? null
        : positionLevelLabel(stopPrice, drawing.entry, drawing.type, pricePrecision)
    const labelFitW = Math.max(
      tpLabel != null ? posBadgeWidth(tpLabel) : 0,
      slLabel != null ? posBadgeWidth(slLabel) : 0
    )
    const minBoxW = Math.max(POSITION_BOX_MIN_W, labelFitW + POS_BADGE_INSET)
    const spanRight = timeToX(boxRightTime) ?? boxLeft + minBoxW
    const boxRight = Math.min(Math.max(spanRight, boxLeft + minBoxW), plotRight)

    return {
      x: (boxLeft + boxRight) / 2 - PLACE_LIMIT_CHIP_W / 2,
      y: topY - PLACE_LIMIT_CHIP_GAP - PLACE_LIMIT_CHIP_H
    }
  }

  const qtyLabel = formatTradeSizeForSymbol(working?.lots ?? 1, symbol)

  const draggingTradeLevel =
    draggingKey?.startsWith('tp:') === true || draggingKey?.startsWith('sl:') === true
  const liveLevelPreview = draggingTradeLevel ? levelPreview : null

  const tpPrice =
    liveLevelPreview?.kind === 'tp'
      ? liveLevelPreview.price
      : liveLevelPreview?.kind === 'sl' && liveLevelPreview.linkedPrice != null
        ? liveLevelPreview.linkedPrice
        : (working?.takeProfit ?? null)
  const slPrice =
    liveLevelPreview?.kind === 'sl'
      ? liveLevelPreview.price
      : liveLevelPreview?.kind === 'tp' && liveLevelPreview.linkedPrice != null
        ? liveLevelPreview.linkedPrice
        : (working?.stopLoss ?? null)

  const showTicketDraft =
    canEditTrade &&
    (liveTp != null || liveSl != null || (isPendingTicketType(ticketOrderType) && liveLimit != null))
  const draftEntryDraggable = isPendingTicketType(ticketOrderType)

  const pendingKindLabel =
    resolvedPendingKind(selectedItem?.pendingKind) === 'stopLimit' ? 'Stop Lim' : 'Limit'
  const openPnlLabel = isPending ? pendingKindLabel : formatPnlUsd(0)

  // Sit labels in the blank pane after the last candle, left of the price scale.
  const paneRight = Math.max(0, plotRight - OVERLAY_LAYOUT.rightPad)
  const placeExtra =
    (canEditTrade && working != null && working.takeProfit == null
      ? OVERLAY_LAYOUT.placeW + OVERLAY_LAYOUT.gap
      : 0) +
    (canEditTrade && working != null && working.stopLoss == null
      ? OVERLAY_LAYOUT.placeW + OVERLAY_LAYOUT.gap
      : 0)
  const entryPillW =
    estimateQtyWidth(qtyLabel) + estimatePnlWidth(openPnlLabel) + OVERLAY_LAYOUT.closeW
  const clusterNeedW = placeExtra + entryPillW
  const playheadCandle =
    paneCurrentCandleRef.current ?? selectPriceFollowCandle(useReplayStore.getState())
  const lastCandleX = playheadCandle ? timeToX(playheadCandle.time) : null
  const afterLast =
    lastCandleX != null && Number.isFinite(lastCandleX)
      ? lastCandleX + 14
      : paneRight - clusterNeedW
  const clusterX = Math.max(8, Math.min(afterLast, paneRight - clusterNeedW))
  const entryPillX = clusterX + placeExtra
  const connectorX = Math.min(
    paneRight - 2,
    Math.max(entryPillX + entryPillW + 8, clusterX + clusterNeedW + 8)
  )

  function renderDraftLevel(
    level: 'limit' | 'tp' | 'sl',
    price: number,
    color: string,
    label: string,
    draggable = true,
    markClose: number | null = null
  ) {
    const y = series?.priceToCoordinate(price)
    if (y == null) return null
    const hasEntry = isPendingTicketType(ticketOrderType)
      ? liveLimit != null
      : markClose != null
    const rrSource: 'tp' | 'sl' | undefined =
      level === 'limit'
        ? liveSl != null && liveTp == null
          ? 'sl'
          : liveTp != null && liveSl == null
            ? 'tp'
            : undefined
        : undefined
    const linkRr =
      draggable &&
      (level === 'limit'
        ? rrSource != null
        : hasEntry && ((level === 'tp' && liveSl == null) || (level === 'sl' && liveTp == null)))
    const badgeW = label === 'Entry' ? 44 : 28
    const badgeX = Math.max(8, plotRight - badgeW - 8)
    return (
      <g key={`draft-${level}`}>
        <line
          x1={0}
          x2={plotRight}
          y1={y}
          y2={y}
          stroke={color}
          strokeWidth={TRADE_OVERLAY.levelWidth}
          strokeDasharray={TRADE_OVERLAY.levelDash}
          className="pointer-events-none"
        />
        {draggable && (
          <rect
            x={0}
            y={y - 5}
            width={plotRight}
            height={10}
            fill="transparent"
            className="pointer-events-auto cursor-ns-resize"
            onMouseDown={(event) =>
              startDrag(event, { kind: 'draft', level, moved: false, linkRr, rrSource })
            }
          />
        )}
        <g
          className={draggable ? 'pointer-events-auto cursor-ns-resize' : 'pointer-events-none'}
          onMouseDown={
            draggable
              ? (event) =>
                  startDrag(event, { kind: 'draft', level, moved: false, linkRr, rrSource })
              : undefined
          }
        >
          <title>{draggable ? `Drag to move ${label}` : label}</title>
          <rect
            x={badgeX}
            y={y - 9}
            width={badgeW}
            height={18}
            rx={OVERLAY_LAYOUT.radius}
            fill={chrome.handleFill}
            stroke={color}
            strokeWidth={1.15}
          />
          <text
            x={badgeX + badgeW / 2}
            y={y + 3.5}
            textAnchor="middle"
            fill={color}
            fontSize={9}
            fontFamily={TRADE_OVERLAY.font}
            fontWeight={700}
            className="pointer-events-none select-none"
          >
            {label}
          </text>
        </g>
      </g>
    )
  }

  function renderPlaceButton(kind: 'tp' | 'sl', x: number, y: number, workingId: string) {
    const color = kind === 'tp' ? TRADE_OVERLAY.tpLine : TRADE_OVERLAY.slLine
    const label = kind === 'tp' ? 'TP' : 'SL'
    const w = OVERLAY_LAYOUT.placeW
    const h = OVERLAY_LAYOUT.placeH
    return (
      <g
        className="pointer-events-auto cursor-ns-resize"
        onMouseDown={(e) => startDrag(e, { kind, mode: 'place', moved: false, workingId })}
        onMouseEnter={() => setPlaceHint(kind)}
        onMouseLeave={() => setPlaceHint((prev) => (prev === kind ? null : prev))}
      >
        <title>{kind === 'tp' ? 'Drag to add Take profit' : 'Drag to add Stop loss'}</title>
        <rect
          x={x}
          y={y - h / 2}
          width={w}
          height={h}
          rx={OVERLAY_LAYOUT.radius}
          ry={OVERLAY_LAYOUT.radius}
          fill={chrome.handleFill}
          stroke={color}
          strokeWidth={1.15}
          strokeDasharray="3 2"
        />
        <text
          x={x + w / 2}
          y={y + 3.5}
          textAnchor="middle"
          fill={color}
          fontSize={9}
          fontFamily={TRADE_OVERLAY.font}
          fontWeight={700}
          className="pointer-events-none select-none"
        >
          {label}
        </text>
        {placeHint === kind && (
          <g className="pointer-events-none">
            <rect
              x={x + w - (kind === 'tp' ? 118 : 112)}
              y={y - h / 2 - 22}
              width={kind === 'tp' ? 118 : 112}
              height={18}
              rx={3}
              ry={3}
              fill={chrome.hintFill}
              stroke={chrome.hintStroke}
              strokeWidth={1}
            />
            <text
              x={x + w - (kind === 'tp' ? 118 : 112) + 8}
              y={y - h / 2 - 9.5}
              fill={chrome.hintText}
              fontSize={10}
              fontFamily={TRADE_OVERLAY.font}
              className="select-none"
            >
              {kind === 'tp' ? 'Drag to add Take profit' : 'Drag to add Stop loss'}
            </text>
          </g>
        )}
      </g>
    )
  }

  function renderActionPill(opts: {
    x: number
    y: number
    border: string
    dashed?: boolean
    qtyFill?: string
    qtyLabel?: string
    pnlLabel: string
    pnlColor: string
    pnlLive?: Position
    closeColor: string
    onClose?: (e: ReactMouseEvent) => void
    onDragStart?: (e: ReactMouseEvent) => void
    dragCursor?: string
  }) {
    const {
      x,
      y,
      border,
      dashed,
      qtyFill,
      qtyLabel: sizeLabel = qtyLabel,
      pnlLabel,
      pnlColor,
      pnlLive,
      closeColor,
      onClose,
      onDragStart,
      dragCursor
    } = opts
    const h = OVERLAY_LAYOUT.pillH
    const qtyW = estimateQtyWidth(sizeLabel)
    const closeW = OVERLAY_LAYOUT.closeW
    const pnlW = estimatePnlWidth(pnlLabel)
    const totalW = qtyW + pnlW + closeW
    const top = y - h / 2

    return (
      <g
        className={`pointer-events-auto ${dragCursor ?? 'cursor-default'}`}
        onMouseDown={onDragStart}
      >
        <rect
          x={x}
          y={top}
          width={totalW}
          height={h}
          rx={OVERLAY_LAYOUT.radius}
          ry={OVERLAY_LAYOUT.radius}
          fill={chrome.handleFill}
          stroke={border}
          strokeWidth={1.35}
          strokeDasharray={dashed ? '3 2' : undefined}
        />
        <rect
          x={x}
          y={top}
          width={qtyW}
          height={h}
          rx={OVERLAY_LAYOUT.radius}
          ry={OVERLAY_LAYOUT.radius}
          fill={qtyFill ?? border}
        />
        {/* Squash right corners of qty block so it sits flush in the pill. */}
        <rect x={x + qtyW - 3} y={top} width={3} height={h} fill={qtyFill ?? border} />
        <text
          x={x + qtyW / 2}
          y={y + 3.5}
          textAnchor="middle"
          fill={TRADE_OVERLAY.qtyText}
          fontSize={11}
          fontFamily={TRADE_OVERLAY.font}
          fontWeight={700}
          className="pointer-events-none select-none"
        >
          {sizeLabel}
        </text>
        <line
          x1={x + qtyW}
          y1={top + 3}
          x2={x + qtyW}
          y2={top + h - 3}
          stroke={border}
          strokeOpacity={0.55}
          strokeWidth={1}
        />
        {pnlLive != null ? (
          <LivePnlText
            working={pnlLive}
            symbol={symbol}
            x={x + qtyW + pnlW / 2}
            y={y + 3.5}
          />
        ) : (
          <text
            x={x + qtyW + pnlW / 2}
            y={y + 3.5}
            textAnchor="middle"
            fill={pnlColor}
            fontSize={10}
            fontFamily={TRADE_OVERLAY.font}
            fontWeight={600}
            className="pointer-events-none select-none"
          >
            {pnlLabel}
          </text>
        )}
        <line
          x1={x + qtyW + pnlW}
          y1={top + 3}
          x2={x + qtyW + pnlW}
          y2={top + h - 3}
          stroke={border}
          strokeOpacity={0.55}
          strokeWidth={1}
        />
        {onClose && (
          <g
            className="pointer-events-auto cursor-pointer"
            onMouseDown={stopAction}
            onClick={onClose}
          >
            <title>Close / cancel</title>
            <rect x={x + qtyW + pnlW} y={top} width={closeW} height={h} fill="transparent" />
            <CloseGlyph cx={x + qtyW + pnlW + closeW / 2} cy={y} color={closeColor} />
          </g>
        )}
      </g>
    )
  }

  return (
    <>
      <svg
        data-snapshot-layer
        className={`absolute left-0 top-0 z-[2] h-full overflow-hidden ${
          placing ? 'cursor-crosshair' : 'pointer-events-none'
        }`}
        width={plotRight || 0}
        height={height || '100%'}
        style={{ width: plotRight }}
        onClick={onClick}
        onMouseDown={onSvgMouseDown}
        onMouseMove={onMove}
        onContextMenu={(event) => {
          if (!pricePick) return
          event.preventDefault()
          setPricePick(null)
        }}
        onMouseLeave={() => {
          if (dragRef.current?.kind === 'place-two') return
          applyHaircross(null)
          setHover(null)
          setPlaceHint(null)
          if (pricePick) setLevelPreview(null)
          if (placing) chart?.clearCrosshairPosition()
        }}
      >
        {closedTrades.map((trade) => {
          const from = toXY(trade.entryTime, trade.entryPrice)
          const to = toXY(trade.exitTime, trade.exitPrice)
          if (!from || !to) return null

          const color = trade.pnl >= 0 ? '#22c55e' : '#ef4444'
          const samePoint = Math.abs(from.x - to.x) < 0.5 && Math.abs(from.y - to.y) < 0.5

          return (
            <g key={`trade-${trade.id}-${trade.exitTime}`}>
              <circle cx={from.x} cy={from.y} r={3} fill={color} />
              {!samePoint && (
                <>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={color}
                    strokeWidth={TRADE_OVERLAY.historyWidth}
                    strokeOpacity={0.9}
                    strokeDasharray={TRADE_OVERLAY.historyDash}
                  />
                  <polygon points={arrowHeadPoints(from, to)} fill={color} stroke="none" />
                </>
              )}
              {samePoint && (
                <circle cx={to.x} cy={to.y} r={4.5} fill="none" stroke={color} strokeWidth={1.5} />
              )}
            </g>
          )
        })}

        {showTicketDraft && (
          <MarkCloseSubscriber>
            {(markClose) => {
              const draftLevels = {
                orderType: ticketOrderType,
                markPrice: markClose,
                limitPrice: liveLimit,
                takeProfit: liveTp,
                stopLoss: liveSl
              }
              const draftSide = inferTicketSide(draftLevels)
              const draftEntryColor =
                draftSide === 'short' ? TRADE_OVERLAY.shortLine : TRADE_OVERLAY.longLine
              const draftEntryPrice = isPendingTicketType(ticketOrderType)
                ? liveLimit
                : liveTp != null || liveSl != null
                  ? markClose
                  : null
              return (
                <g key="ticket-draft">
                  {draftEntryPrice != null &&
                    renderDraftLevel(
                      'limit',
                      draftEntryPrice,
                      draftEntryColor,
                      'Entry',
                      draftEntryDraggable,
                      markClose
                    )}
                  {liveTp != null &&
                    renderDraftLevel('tp', liveTp, TRADE_OVERLAY.tpLine, 'TP', true, markClose)}
                  {liveSl != null &&
                    renderDraftLevel('sl', liveSl, TRADE_OVERLAY.slLine, 'SL', true, markClose)}
                </g>
              )
            }}
          </MarkCloseSubscriber>
        )}

        {workingOverlays.map((item) => {
          const working = item.working
          const isPending = item.isPending
          const workingId = item.id
          const itemPnlScale = pnlScaleForSymbol(symbol, working.lots)
          const itemSideColor =
            working.side === 'long' ? TRADE_OVERLAY.longLine : TRADE_OVERLAY.shortLine
          const itemPendingLabel =
            resolvedPendingKind(item.pendingKind) === 'stopLimit' ? 'Stop Lim' : 'Limit'
          const itemOpenPnlLabel = isPending ? itemPendingLabel : formatPnlUsd(0)
          const itemOpenPnlColor = TRADE_OVERLAY.handleTextMuted
          const previewHere =
            draggingKey === `tp:place:${workingId}` ||
            draggingKey === `tp:move:${workingId}` ||
            draggingKey === `sl:place:${workingId}` ||
            draggingKey === `sl:move:${workingId}`
          const itemTpPrice = previewHere ? tpPrice : working.takeProfit
          const itemSlPrice = previewHere ? slPrice : working.stopLoss
          const liveEntryPrice =
            pendingPreview?.id === workingId ? pendingPreview.price : working.entryPrice
          const itemEntryY = series?.priceToCoordinate(liveEntryPrice)
          const itemTpY = itemTpPrice != null ? series?.priceToCoordinate(itemTpPrice) : null
          const itemSlY = itemSlPrice != null ? series?.priceToCoordinate(itemSlPrice) : null
          if (itemEntryY == null) return null
          const showTpLine = itemTpPrice != null
          const showSlLine = itemSlPrice != null
          const tpPnl =
            itemTpPrice != null
              ? pnlForSide(working.side, working.entryPrice, itemTpPrice, itemPnlScale)
              : null
          const slPnl =
            itemSlPrice != null
              ? pnlForSide(working.side, working.entryPrice, itemSlPrice, itemPnlScale)
              : null
          const entryY = itemEntryY
          const tpY = itemTpY
          const slY = itemSlY
          const sideColor = itemSideColor
          const openPnlLabel = itemOpenPnlLabel
          const openPnlColor = itemOpenPnlColor
          const tpPnlLabel = formatPnlUsd(tpPnl)
          const slPnlLabel = formatPnlUsd(slPnl)
          const itemRr =
            realizedRiskReward(working.side, working.entryPrice, working.stopLoss, working.takeProfit) ??
            riskReward
          const rrLabel = formatRiskReward(itemRr)
          return (
          <g
            key={`open-pos-${workingId}`}
            onMouseDown={() => selectWorking(workingId)}
          >
            {/* Risk / reward zones between entry and armed levels. */}
            {showSlLine && slY != null && (
              <rect
                x={0}
                y={Math.min(entryY, slY)}
                width={plotRight}
                height={Math.abs(slY - entryY)}
                fill={TRADE_OVERLAY.zoneSl}
                className="pointer-events-none"
              />
            )}
            {showTpLine && tpY != null && (
              <rect
                x={0}
                y={Math.min(entryY, tpY)}
                width={plotRight}
                height={Math.abs(tpY - entryY)}
                fill={TRADE_OVERLAY.zoneTp}
                className="pointer-events-none"
              />
            )}

            <line
              x1={0}
              x2={plotRight}
              y1={entryY}
              y2={entryY}
              stroke={sideColor}
              strokeWidth={TRADE_OVERLAY.entryWidth}
              strokeDasharray={isPending ? TRADE_OVERLAY.levelDash : TRADE_OVERLAY.entryDash}
            />
            {isPending && canEditTrade && (
              <rect
                x={0}
                y={entryY - 5}
                width={plotRight}
                height={10}
                fill="transparent"
                className="pointer-events-auto cursor-ns-resize"
                onMouseDown={(e) => startDrag(e, { kind: 'pending', moved: false, workingId })}
              />
            )}

            {showTpLine && tpY != null && (
              <line
                x1={0}
                x2={plotRight}
                y1={tpY}
                y2={tpY}
                stroke={TRADE_OVERLAY.tpLine}
                strokeWidth={TRADE_OVERLAY.levelWidth}
                strokeDasharray={TRADE_OVERLAY.levelDash}
              />
            )}

            {showSlLine && slY != null && (
              <line
                x1={0}
                x2={plotRight}
                y1={slY}
                y2={slY}
                stroke={TRADE_OVERLAY.slLine}
                strokeWidth={TRADE_OVERLAY.levelWidth}
                strokeDasharray={TRADE_OVERLAY.levelDash}
              />
            )}

            {/* Vertical connector tying entry ↔ TP ↔ SL. */}
            {(showTpLine || showSlLine) && (
              <g className="pointer-events-none">
                {showTpLine && tpY != null && (
                  <line
                    x1={connectorX}
                    x2={connectorX}
                    y1={Math.min(entryY, tpY)}
                    y2={Math.max(entryY, tpY)}
                    stroke={TRADE_OVERLAY.connector}
                    strokeWidth={1}
                    strokeDasharray={TRADE_OVERLAY.connectorDash}
                    strokeOpacity={0.85}
                  />
                )}
                {showSlLine && slY != null && (
                  <line
                    x1={connectorX}
                    x2={connectorX}
                    y1={Math.min(entryY, slY)}
                    y2={Math.max(entryY, slY)}
                    stroke={TRADE_OVERLAY.connector}
                    strokeWidth={1}
                    strokeDasharray={TRADE_OVERLAY.connectorDash}
                    strokeOpacity={0.85}
                  />
                )}
                <circle
                  cx={connectorX}
                  cy={entryY}
                  r={OVERLAY_LAYOUT.connectorR}
                  fill={TRADE_OVERLAY.connector}
                />
                {showTpLine && tpY != null && (
                  <circle
                    cx={connectorX}
                    cy={tpY}
                    r={OVERLAY_LAYOUT.connectorR}
                    fill={chrome.handleFill}
                    stroke={TRADE_OVERLAY.connector}
                    strokeWidth={1.25}
                  />
                )}
                {showSlLine && slY != null && (
                  <circle
                    cx={connectorX}
                    cy={slY}
                    r={OVERLAY_LAYOUT.connectorR}
                    fill={chrome.handleFill}
                    stroke={TRADE_OVERLAY.connector}
                    strokeWidth={1.25}
                  />
                )}
              </g>
            )}

            {/* Entry cluster: optional TP/SL place grips + qty / live PNL / close. */}
            {(() => {
              let x = clusterX
              const nodes: React.JSX.Element[] = []

              if (canEditTrade && working.takeProfit == null) {
                nodes.push(<g key="place-tp">{renderPlaceButton('tp', x, entryY, workingId)}</g>)
                x += OVERLAY_LAYOUT.placeW + OVERLAY_LAYOUT.gap
              }

              if (canEditTrade && working.stopLoss == null) {
                nodes.push(<g key="place-sl">{renderPlaceButton('sl', x, entryY, workingId)}</g>)
                x += OVERLAY_LAYOUT.placeW + OVERLAY_LAYOUT.gap
              }

              nodes.push(
                <g key="entry-pill">
                  {renderActionPill({
                    x,
                    y: entryY,
                    border: sideColor,
                    dashed: isPending,
                    qtyFill: sideColor,
                    qtyLabel: formatTradeSizeForSymbol(working.lots, symbol),
                    pnlLabel: openPnlLabel,
                    pnlColor: openPnlColor,
                    pnlLive: isPending ? undefined : working,
                    closeColor: TRADE_OVERLAY.closeIcon,
                    dragCursor: canEditTrade && isPending ? 'cursor-ns-resize' : undefined,
                    onDragStart:
                      canEditTrade && isPending
                        ? (e) => startDrag(e, { kind: 'pending', moved: false, workingId })
                        : undefined,
                    onClose: canEditTrade
                      ? (e) => {
                          stopAction(e)
                          if (isPending) cancelPending(workingId)
                          else paperClose(workingId)
                        }
                      : undefined
                  })}
                </g>
              )

              return <g>{nodes}</g>
            })()}

            {/* Armed TP pill — drag to move, X clears before fill. */}
            {showTpLine &&
              tpY != null &&
              working.takeProfit != null &&
              renderActionPill({
                x: entryPillX,
                y: tpY,
                border: TRADE_OVERLAY.tpLine,
                dashed: true,
                qtyFill: TRADE_OVERLAY.tpLine,
                pnlLabel: tpPnlLabel,
                pnlColor: TRADE_OVERLAY.tpLine,
                closeColor: TRADE_OVERLAY.tpLine,
                dragCursor: canEditTrade ? 'cursor-ns-resize' : undefined,
                onDragStart: canEditTrade
                  ? (e) => startDrag(e, { kind: 'tp', mode: 'move', moved: false, workingId })
                  : undefined,
                onClose: canEditTrade
                  ? (e) => {
                      stopAction(e)
                      setTakeProfit(null, { id: workingId })
                    }
                  : undefined
              })}

            {/* Armed SL pill — drag to move, X clears before fill. */}
            {showSlLine &&
              slY != null &&
              working.stopLoss != null &&
              renderActionPill({
                x: entryPillX,
                y: slY,
                border: TRADE_OVERLAY.slLine,
                dashed: true,
                qtyFill: TRADE_OVERLAY.slLine,
                pnlLabel: slPnlLabel,
                pnlColor: TRADE_OVERLAY.slLine,
                closeColor: TRADE_OVERLAY.slLine,
                dragCursor: canEditTrade ? 'cursor-ns-resize' : undefined,
                onDragStart: canEditTrade
                  ? (e) => startDrag(e, { kind: 'sl', mode: 'move', moved: false, workingId })
                  : undefined,
                onClose: canEditTrade
                  ? (e) => {
                      stopAction(e)
                      setStopLoss(null, { id: workingId })
                    }
                  : undefined
              })}

            {/* Live preview pills while placing (before commit). */}
            {previewHere &&
              liveLevelPreview?.kind === 'tp' &&
              working.takeProfit == null &&
              tpY != null &&
              renderActionPill({
                x: entryPillX,
                y: tpY,
                border: TRADE_OVERLAY.tpLine,
                dashed: true,
                qtyFill: TRADE_OVERLAY.tpLine,
                pnlLabel: `${tpPnlLabel} · ${rrLabel}`,
                pnlColor: TRADE_OVERLAY.tpLine,
                closeColor: TRADE_OVERLAY.tpLine
              })}
            {previewHere &&
              liveLevelPreview?.kind === 'sl' &&
              working.stopLoss == null &&
              slY != null &&
              renderActionPill({
                x: entryPillX,
                y: slY,
                border: TRADE_OVERLAY.slLine,
                dashed: true,
                qtyFill: TRADE_OVERLAY.slLine,
                pnlLabel: `${slPnlLabel} · ${rrLabel}`,
                pnlColor: TRADE_OVERLAY.slLine,
                closeColor: TRADE_OVERLAY.slLine
              })}
          </g>
          )
        })}

        {shownDrawings.map((drawing) => {
          const selected = drawing.id === selectedDrawingId
          const hovered = drawing.id === hoveredDrawingId
          const dragging = draggingKey?.includes(drawing.id) ?? false
          const showHandles = selected || hovered || dragging
          const hoverHandlers = {
            onMouseEnter: (): void => setHoveredDrawingId(drawing.id),
            onMouseLeave: (): void =>
              setHoveredDrawingId((current) => (current === drawing.id ? null : current))
          }

          if (drawing.type === 'hline') {
            const y = series?.priceToCoordinate(drawing.price)
            if (y == null) return null
            return (
              <HLineShape
                key={drawing.id}
                y={y}
                width={plotRight}
                midX={midX}
                selected={selected}
                canSelect={canSelect}
                canDraw={canDraw}
                showHandles={showHandles}
                style={drawing.style}
                onSelect={(e) => selectDrawingOnClick(e, drawing.id)}
                onDrag={(e) => startDrag(e, { kind: 'hline', id: drawing.id, moved: false })}
                {...hoverHandlers}
              />
            )
          }

          if (drawing.type === 'trendline') {
            const a = toXY(drawing.t1, drawing.p1)
            const b = toXY(drawing.t2, drawing.p2)
            if (!a || !b) return null
            return (
              <TrendLineShape
                key={drawing.id}
                a={a}
                b={b}
                selected={selected}
                canSelect={canSelect}
                canDraw={canDraw}
                showHandles={showHandles}
                style={drawing.style}
                onSelect={(e) => selectDrawingOnClick(e, drawing.id)}
                onDragEnd={(end, e) =>
                  startDrag(e, { kind: 'trend', id: drawing.id, end, moved: false })
                }
                onDragBody={(e) =>
                  startDrag(e, { kind: 'trend', id: drawing.id, end: 'body', moved: false })
                }
                {...hoverHandlers}
              />
            )
          }

          if (drawing.type === 'fib') {
            const a = toXY(drawing.t1, drawing.p1)
            const b = toXY(drawing.t2, drawing.p2)
            if (!a || !b || !series) return null
            const levelConfigs = fibLevelsOf(drawing, fibLevelDefaults)
            return (
              <FibShape
                key={drawing.id}
                a={a}
                b={b}
                levels={fibLevelsAt(
                  drawing.p1,
                  drawing.p2,
                  (price) => series.priceToCoordinate(price),
                  levelConfigs
                )}
                selected={selected}
                labelColor={chrome.hintText}
                canSelect={canSelect}
                canDraw={canDraw}
                showHandles={showHandles}
                style={drawing.style}
                pricePrecision={pricePrecision}
                plotRight={plotRight}
                onSelect={(e) => selectDrawingOnClick(e, drawing.id)}
                onDragEnd={(end, e) =>
                  startDrag(e, { kind: 'fib', id: drawing.id, end, moved: false })
                }
                onDragBody={(e) =>
                  startDrag(e, { kind: 'fib', id: drawing.id, end: 'body', moved: false })
                }
                {...hoverHandlers}
              />
            )
          }

          if (drawing.type === 'fibchannel') {
            const a = toXY(drawing.t1, drawing.p1)
            const b = toXY(drawing.t2, drawing.p2)
            const c = toXY(drawing.t3, drawing.p3)
            if (!a || !b || !c) return null
            const levelConfigs = fibLevelsOf(drawing, fibLevelDefaults)
            return (
              <FibChannelShape
                key={drawing.id}
                p1={a}
                p2={b}
                p3={c}
                levels={fibChannelLevelsAt(
                  { time: drawing.t1, price: drawing.p1 },
                  { time: drawing.t2, price: drawing.p2 },
                  { time: drawing.t3, price: drawing.p3 },
                  toXY,
                  levelConfigs
                )}
                selected={selected}
                labelColor={chrome.hintText}
                canSelect={canSelect}
                canDraw={canDraw}
                showHandles={showHandles}
                style={drawing.style}
                pricePrecision={pricePrecision}
                plotRight={plotRight}
                onSelect={(e) => selectDrawingOnClick(e, drawing.id)}
                onDragHandle={(handle, e) =>
                  startDrag(e, { kind: 'fibchannel', id: drawing.id, end: handle, moved: false })
                }
                onDragBody={(e) =>
                  startDrag(e, { kind: 'fibchannel', id: drawing.id, end: 'body', moved: false })
                }
                {...hoverHandlers}
              />
            )
          }

          if (drawing.type === 'rect') {
            const a = toXY(drawing.t1, drawing.p1)
            const b = toXY(drawing.t2, drawing.p2)
            if (!a || !b) return null
            return (
              <RectShape
                key={drawing.id}
                a={a}
                b={b}
                selected={selected}
                canSelect={canSelect}
                canDraw={canDraw}
                showHandles={showHandles}
                style={drawing.style}
                onSelect={(e) => selectDrawingOnClick(e, drawing.id)}
                onDragHandle={(handle, e) =>
                  startDrag(e, { kind: 'rect', id: drawing.id, handle, moved: false })
                }
                onDragBody={(e) =>
                  startDrag(e, { kind: 'rect', id: drawing.id, handle: 'body', moved: false })
                }
                {...hoverHandlers}
              />
            )
          }

          if (isPositionDrawing(drawing)) {
            const anchor = toXY(drawing.t, drawing.entry)
            if (!anchor || !series) return null
            const preview = posPreview?.id === drawing.id ? posPreview : null

            let targetPrice: number | null = drawing.target
            let stopPrice: number | null = drawing.stop
            if (targetPrice == null || stopPrice == null) {
              const defaults = defaultPositionLevels(
                drawing.type,
                drawing.entry,
                readVisiblePriceRange()
              )
              if (targetPrice == null) targetPrice = defaults?.target ?? null
              if (stopPrice == null) stopPrice = defaults?.stop ?? null
            }
            let targetY: number | null =
              targetPrice == null ? null : (series.priceToCoordinate(targetPrice) ?? null)
            let stopY: number | null =
              stopPrice == null ? null : (series.priceToCoordinate(stopPrice) ?? null)

            if (preview) {
              if (preview.level === 'target') {
                targetY = preview.y
                targetPrice = preview.price
                if (preview.mirrorPrice != null && drawing.stop == null) {
                  stopY = preview.mirrorY
                  stopPrice = preview.mirrorPrice
                }
              } else {
                stopY = preview.y
                stopPrice = preview.price
                if (preview.mirrorPrice != null && drawing.target == null) {
                  targetY = preview.mirrorY
                  targetPrice = preview.mirrorPrice
                }
              }
            }

            // Box horizontal extent: drawing.span bars right of the entry anchor,
            // but never narrower than the TP/SL badges so they can sit centered.
            const boxRightTime = drawing.t + intervalSeconds * drawing.span
            const boxLeft = anchor.x
            const tpLabel =
              targetPrice == null
                ? null
                : positionLevelLabel(targetPrice, drawing.entry, drawing.type, pricePrecision)
            const slLabel =
              stopPrice == null
                ? null
                : positionLevelLabel(stopPrice, drawing.entry, drawing.type, pricePrecision)
            const labelFitW = Math.max(
              tpLabel != null ? posBadgeWidth(tpLabel) : 0,
              slLabel != null ? posBadgeWidth(slLabel) : 0
            )
            const minBoxW = Math.max(POSITION_BOX_MIN_W, labelFitW + POS_BADGE_INSET)
            const spanRight = timeToX(boxRightTime) ?? boxLeft + minBoxW
            const boxRight = Math.min(Math.max(spanRight, boxLeft + minBoxW), plotRight)

            // Box vertical extent spans the present levels; keep a visible floor.
            const levelYs = [anchor.y, targetY, stopY].filter((y): y is number => y != null)
            let topY = Math.min(...levelYs)
            let bottomY = Math.max(...levelYs)
            if (bottomY - topY < POSITION_BOX_MIN_H) {
              const mid = (bottomY + topY) / 2
              topY = mid - POSITION_BOX_MIN_H / 2
              bottomY = mid + POSITION_BOX_MIN_H / 2
            }

            // Live price line from the entry point to the position's status. The
            // entry candle is the basis: the first candle inside the box whose
            // range has seen the entry point. If no candle in the box has seen
            // the entry, the line is not shown at all. From the entry candle
            // onward, if a candle crosses the stop or the target, the end sits on
            // that line at the first crossing candle's x; otherwise the end is
            // placed on the last candle still inside the box (both x and y).
            let priceLine: { x1: number; y1: number; x2: number; y2: number } | null = null
            let priceLineTowardTp = true
            const candles = paneCandlesRef.current ?? EMPTY_CANDLES
            if (playheadCandle && Number.isFinite(playheadCandle.close)) {
              if (playheadCandle.time >= drawing.t) {
                const inBox = playheadCandle.time <= boxRightTime
                // First: the entry candle — the first candle inside the box whose
                // range contains the entry line (low <= entry <= high).
                let entryIdx = -1
                let startX: number | null = null
                const entryLogical = unixTimeToLogical(drawing.t, candles, intervalSeconds)
                if (entryLogical != null) {
                  const fromIdx = Math.max(0, Math.floor(entryLogical))
                  for (let i = fromIdx; i < candles.length; i++) {
                    const c = candles[i]
                    if (c.time > boxRightTime) break
                    if (c.low <= drawing.entry && drawing.entry <= c.high) {
                      const cx = timeToX(c.time)
                      if (cx != null) {
                        startX = cx
                        entryIdx = i
                      }
                      break
                    }
                  }
                }
                if (entryIdx >= 0 && startX != null) {
                  // Then: from the entry candle onward, the first candle whose
                  // range has crossed the stop or the target line.
                  let resolution: { candle: Candle; atTarget: boolean } | null = null
                  const effectiveTarget = targetY != null ? series.coordinateToPrice(targetY) : null
                  const effectiveStop = stopY != null ? series.coordinateToPrice(stopY) : null
                  const endLogical = unixTimeToLogical(
                    Math.min(playheadCandle.time, boxRightTime),
                    candles,
                    intervalSeconds
                  )
                  if (endLogical != null) {
                    const endIdx = Math.min(Math.floor(endLogical), candles.length - 1)
                    for (let i = entryIdx; i <= endIdx; i++) {
                      const c = candles[i]
                      if (!c) continue
                      const hitStop =
                        effectiveStop != null &&
                        (drawing.type === 'long' ? c.low <= effectiveStop : c.high >= effectiveStop)
                      const hitTarget =
                        effectiveTarget != null &&
                        (drawing.type === 'long'
                          ? c.high >= effectiveTarget
                          : c.low <= effectiveTarget)
                      if (hitStop) {
                        resolution = { candle: c, atTarget: false }
                        break
                      }
                      if (hitTarget) {
                        resolution = { candle: c, atTarget: true }
                        break
                      }
                    }
                  }
                  let endX: number | null = null
                  let endY: number | null = null
                  if (resolution) {
                    // Exited at a level: end on that line at the crossing candle.
                    endX = timeToX(resolution.candle.time)
                    endY = resolution.atTarget ? targetY : stopY
                    priceLineTowardTp = resolution.atTarget
                  } else {
                    // No level seen: end on the last candle inside the box.
                    const lastInBox = inBox ? playheadCandle : lastCandleAtOrBefore(boxRightTime)
                    if (lastInBox && Number.isFinite(lastInBox.close)) {
                      endX = timeToX(lastInBox.time)
                      endY = series.priceToCoordinate(lastInBox.close)
                      priceLineTowardTp = isValidPositionLevel(
                        drawing.type,
                        'target',
                        drawing.entry,
                        lastInBox.close
                      )
                    }
                  }
                  if (endX != null && endY != null) {
                    const clampedX = Math.min(Math.max(endX, startX), boxRight)
                    if (clampedX > startX) {
                      priceLine = { x1: startX, y1: anchor.y, x2: clampedX, y2: endY }
                    }
                  }
                }
              }
            }

            return (
              <PositionShape
                key={drawing.id}
                side={drawing.type}
                x={boxLeft}
                x2={boxRight}
                entryY={anchor.y}
                targetY={targetY}
                stopY={stopY}
                entryPrice={drawing.entry}
                targetPrice={targetPrice}
                stopPrice={stopPrice}
                topY={topY}
                bottomY={bottomY}
                selected={selected}
                canSelect={canSelect}
                canDraw={canDraw}
                showHandles={showHandles}
                style={drawing.style}
                pricePrecision={pricePrecision}
                priceLine={priceLine}
                priceLineTowardTp={priceLineTowardTp}
                onSelect={(e) => selectDrawingOnClick(e, drawing.id)}
                onDragBox={(e) =>
                  startDrag(e, { kind: 'pos', id: drawing.id, end: 'body', moved: false })
                }
                onDragEntry={(e) =>
                  startDrag(e, {
                    kind: 'pos-entry',
                    id: drawing.id,
                    moved: false,
                    axis: 'pending',
                    startX: e.clientX,
                    startY: e.clientY
                  })
                }
                onDragTarget={(e) =>
                  startDrag(e, {
                    kind: 'pos-level',
                    id: drawing.id,
                    level: 'target',
                    moved: false
                  })
                }
                onDragStop={(e) =>
                  startDrag(e, {
                    kind: 'pos-level',
                    id: drawing.id,
                    level: 'stop',
                    moved: false
                  })
                }
                {...hoverHandlers}
              />
            )
          }

          return null
        })}

        {pendingTrend &&
          (() => {
            const a = toXY(pendingTrend.time, pendingTrend.price)
            if (!a) return null

            const firstHandle = (
              <circle
                cx={a.x}
                cy={a.y}
                r={4.5}
                fill={HANDLE_FILL}
                stroke={HANDLE_STROKE}
                strokeWidth={1.25}
              />
            )

            if (drawTool === 'fib' && hover && series) {
              const hoverPrice = series.coordinateToPrice(hover.y)
              const levels =
                hoverPrice != null && Number.isFinite(hoverPrice)
                  ? fibLevelsAt(
                      pendingTrend.price,
                      hoverPrice,
                      (price) => series.priceToCoordinate(price),
                      fibLevelDefaults
                    )
                  : []
              return (
                <g key="pending">
                  <FibShape
                    a={a}
                    b={hover}
                    levels={levels}
                    selected={false}
                    labelColor={chrome.hintText}
                    canSelect={false}
                    canDraw={false}
                    showHandles={false}
                    pricePrecision={pricePrecision}
                    plotRight={plotRight}
                  />
                  {firstHandle}
                </g>
              )
            }

            if (drawTool === 'fibchannel' && hover && chart) {
              const hoverTime = xToUnixTime(chart, hover.x, paneCandlesRef.current ?? EMPTY_CANDLES, intervalSeconds)
              const hoverPrice = series?.coordinateToPrice(hover.y)
              if (pendingTrendEnd) {
                const b = toXY(pendingTrendEnd.time, pendingTrendEnd.price)
                if (
                  b &&
                  hoverTime != null &&
                  hoverPrice != null &&
                  Number.isFinite(hoverPrice)
                ) {
                  const levels = fibChannelLevelsAt(
                    pendingTrend,
                    pendingTrendEnd,
                    { time: hoverTime, price: hoverPrice },
                    toXY,
                    fibLevelDefaults
                  )
                  return (
                    <g key="pending">
                      <FibChannelShape
                        p1={a}
                        p2={b}
                        p3={hover}
                        levels={levels}
                        selected={false}
                        labelColor={chrome.hintText}
                        canSelect={false}
                        canDraw={false}
                        showHandles={false}
                        pricePrecision={pricePrecision}
                        plotRight={plotRight}
                      />
                      {firstHandle}
                      <circle
                        cx={b.x}
                        cy={b.y}
                        r={4.5}
                        fill={HANDLE_FILL}
                        stroke={HANDLE_STROKE}
                        strokeWidth={1.25}
                      />
                    </g>
                  )
                }
              }
              return (
                <g key="pending">
                  {firstHandle}
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={hover.x}
                    y2={hover.y}
                    stroke={DRAW_STROKE}
                    strokeWidth={DRAW_WIDTH}
                    strokeDasharray="4 3"
                  />
                </g>
              )
            }

            if (drawTool === 'rect' && hover) {
              return (
                <g key="pending">
                  <RectShape
                    a={a}
                    b={hover}
                    selected={false}
                    canSelect={false}
                    canDraw={false}
                    showHandles={false}
                    style={toolDefaults.rect}
                  />
                  {firstHandle}
                </g>
              )
            }

            return (
              <g key="pending">
                {firstHandle}
                {hover && (
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={hover.x}
                    y2={hover.y}
                    stroke={DRAW_STROKE}
                    strokeWidth={DRAW_WIDTH}
                    strokeDasharray="4 3"
                  />
                )}
              </g>
            )
          })()}

        {placing && (
          <g
            className="pointer-events-none"
            stroke={palette.crosshairColor}
            strokeWidth={crosshairSettings.lineWidth}
            strokeDasharray={crosshairDasharray(crosshairSettings.lineStyle)}
          >
            <line ref={hairHRef} visibility="hidden" x1={0} y1={0} x2={plotRight} y2={0} />
            <line ref={hairVRef} visibility="hidden" x1={0} y1={0} x2={0} y2={height} />
          </g>
        )}
      </svg>

      {canEditTrade &&
        selectedDrawing != null &&
        isPositionDrawing(selectedDrawing) &&
        (() => {
          const origin = positionChipOrigin(selectedDrawing)
          if (!origin) return null
          return (
            <PositionLimitChip
              drawing={selectedDrawing}
              origin={origin}
              visibleRange={readVisiblePriceRange()}
            />
          )
        })()}

      {canSelect &&
        selectedDrawing != null &&
        selectedAnchor != null &&
        selectedStyle != null &&
        selectedFields != null && (
          <DrawingStyleWidget
            pos={widgetPos ?? { x: selectedAnchor.x + 12, y: selectedAnchor.y + 12 }}
            onPosChange={setWidgetPos}
            style={selectedStyle}
            fields={selectedFields}
            tool={drawingToolType(selectedDrawing)}
            showZoneColors={isPositionDrawing(selectedDrawing)}
            onStyleChange={onSelectedStyleChange}
            onApplyPreset={onSelectedPreset}
            onOpenSettings={onOpenDrawingSettings}
            onDelete={onDeleteSelectedDrawing}
          />
        )}
    </>
  )
}, (prev, next) => {
  return (
    prev.chart === next.chart &&
    prev.series === next.series &&
    prev.paneTimeframe === next.paneTimeframe &&
    prev.pricePrecision === next.pricePrecision &&
    prev.paneCandlesRef === next.paneCandlesRef &&
    prev.paneCurrentCandleRef === next.paneCurrentCandleRef
  )
})

function DrawingOverlay({
  chart,
  series,
  paneTimeframe,
  paneCurrentCandle = null,
  paneCandles = EMPTY_CANDLES,
  pricePrecision = DEFAULT_PRICE_PRECISION
}: DrawingOverlayProps) {
  const paneCandlesRef = useRef(paneCandles)
  const paneCurrentCandleRef = useRef(paneCurrentCandle)
  paneCandlesRef.current = paneCandles
  paneCurrentCandleRef.current = paneCurrentCandle
  if (chart) {
    overlayPaneRefs.set(chart, {
      candles: paneCandlesRef,
      current: paneCurrentCandleRef
    })
  }
  return (
    <DrawingOverlayInner
      chart={chart}
      series={series}
      paneTimeframe={paneTimeframe}
      pricePrecision={pricePrecision}
      paneCandlesRef={paneCandlesRef}
      paneCurrentCandleRef={paneCurrentCandleRef}
    />
  )
}

export default memo(DrawingOverlay, (prev, next) => {
  if (next.chart) {
    const live = overlayPaneRefs.get(next.chart)
    if (live) {
      live.candles.current = next.paneCandles ?? EMPTY_CANDLES
      live.current.current = next.paneCurrentCandle ?? null
    }
  }
  return (
    prev.chart === next.chart &&
    prev.series === next.series &&
    prev.paneTimeframe === next.paneTimeframe &&
    prev.pricePrecision === next.pricePrecision
  )
})
