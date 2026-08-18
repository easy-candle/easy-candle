import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { ViewportBumpPrimitive } from '@/lib/chart/viewportBumpPrimitive'
import {
  isTwoPointTool,
  type Drawing,
  type Endpoint,
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
  FibShape,
  fibLevelsAt,
  HANDLE_FILL,
  HANDLE_STROKE,
  HLineShape,
  RectShape,
  TrendLineShape,
  type Point
} from '@/components/DrawingShapes'
import {
  formatPnlUsd,
  formatRiskReward,
  formatTradeSizeForSymbol,
  isValidStopLoss,
  isValidTakeProfit,
  pnlForSide,
  pnlScaleForSymbol,
  realizedRiskReward,
  stopLossFromTakeProfit,
  takeProfitFromStopLoss,
  unrealizedPnl
} from '@/lib/paperTrade'
import { OVERLAY_LAYOUT, TRADE_OVERLAY } from '@/lib/tradeOverlayStyles'
import { CHART_PALETTES } from '@/lib/theme'
import { alignTimeToInterval, DEFAULT_TIMEFRAME, TIMEFRAMES } from '@shared/timeframes'
import type { Candle } from '@shared/candleUtils'
import { DEFAULT_PRICE_PRECISION } from '@shared/pricePrecision'
import { useReplayStore } from '@/store/replayStore'
import { useThemeStore } from '@/store/themeStore'

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
      kind: 'rect'
      id: string
      handle: RectHandle | 'body'
      moved: boolean
      origin?: BodyOrigin
    }
  | { kind: 'place-two'; tool: TwoPointTool; startX: number; startY: number; moved: boolean }
  | { kind: 'tp' | 'sl'; mode: 'place' | 'move'; moved: boolean }

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

function CloseGlyph({
  cx,
  cy,
  color
}: {
  cx: number
  cy: number
  color: string
}) {
  const s = 3.5
  return (
    <g className="pointer-events-none" stroke={color} strokeWidth={1.6} strokeLinecap="round">
      <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} />
      <line x1={cx + s} y1={cy - s} x2={cx - s} y2={cy + s} />
    </g>
  )
}

/** SVG drawing layer synced to lightweight-charts pan/zoom. */
export default function DrawingOverlay({
  chart,
  series,
  paneTimeframe,
  paneCurrentCandle = null,
  paneCandles = [],
  pricePrecision = DEFAULT_PRICE_PRECISION
}: DrawingOverlayProps) {
  const drawings = useReplayStore((s) => s.drawings)
  const drawTool = useReplayStore((s) => s.drawTool)
  const pendingTrend = useReplayStore((s) => s.pendingTrend)
  const selectedDrawingId = useReplayStore((s) => s.selectedDrawingId)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const position = useReplayStore((s) => s.position)
  const markCandle = useReplayStore((s) => s.currentCandle)
  const riskReward = useReplayStore((s) => s.riskReward)
  const addHorizontalLine = useReplayStore((s) => s.addHorizontalLine)
  const updateHorizontalLine = useReplayStore((s) => s.updateHorizontalLine)
  const addTwoPoint = useReplayStore((s) => s.addTwoPoint)
  const updateTwoPointEndpoint = useReplayStore((s) => s.updateTwoPointEndpoint)
  const updateRectHandle = useReplayStore((s) => s.updateRectHandle)
  const cloneDrawing = useReplayStore((s) => s.cloneDrawing)
  const moveDrawing = useReplayStore((s) => s.moveDrawing)
  const setDrawTool = useReplayStore((s) => s.setDrawTool)
  const selectDrawing = useReplayStore((s) => s.selectDrawing)
  const setTakeProfit = useReplayStore((s) => s.setTakeProfit)
  const setStopLoss = useReplayStore((s) => s.setStopLoss)
  const paperClose = useReplayStore((s) => s.paperClose)
  const mode = useReplayStore((s) => s.mode)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const symbol = useReplayStore((s) => s.symbol)
  const theme = useThemeStore((s) => s.theme)
  const chrome = CHART_PALETTES[theme]

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

  function mapTimeToPane(time: number): number {
    return alignTimeToInterval(time, intervalSeconds)
  }

  function timeToX(time: number): number | null {
    if (!chart) return null
    const exact = chart.timeScale().timeToCoordinate(time as Time)
    if (exact != null) return exact
    // Align only for in-range times (split-pane TF mapping). Aligning a
    // future time floors it back onto the last bar and snaps the endpoint.
    if (isTimeInSeriesRange(time, paneCandles)) {
      const aligned = mapTimeToPane(time)
      if (aligned !== time) {
        const alignedX = chart.timeScale().timeToCoordinate(aligned as Time)
        if (alignedX != null) return alignedX
      }
    }
    const logical = unixTimeToLogical(time, paneCandles, intervalSeconds)
    if (logical == null) return null
    return logicalToX(chart, logical)
  }

  const [version, setVersion] = useState(0)
  const [hover, setHover] = useState<Point | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [levelPreview, setLevelPreview] = useState<LevelPreview | null>(null)
  const [placeHint, setPlaceHint] = useState<'tp' | 'sl' | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)
  const levelPreviewRef = useRef(levelPreview)
  const paneCandlesRef = useRef(paneCandles)
  levelPreviewRef.current = levelPreview
  paneCandlesRef.current = paneCandles

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    if (!chart || !series) return undefined

    // Coalesce LWC paints (price-scale drag fires many updateAllViews per frame)
    // into one React remount of SVG coords.
    let raf = 0
    const scheduleBump = (): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
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

  const placing = canDraw && (drawTool === 'hline' || isTwoPointTool(drawTool))

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

      if (drag.kind === 'place-two') {
        setHover({ x, y })
        if (Math.hypot(x - drag.startX, y - drag.startY) >= 4) drag.moved = true
        return
      }

      const price = series.coordinateToPrice(y)
      if (price == null || !Number.isFinite(price)) return

      if (drag.kind === 'hline') {
        drag.moved = true
        updateHorizontalLine(drag.id, price)
        return
      }

      if (drag.kind === 'tp' || drag.kind === 'sl') {
        drag.moved = true
        const state = useReplayStore.getState()
        const open = state.position
        // Guide preview only while placing the first level; later moves are free.
        const linked =
          drag.mode === 'place' && open != null
            ? linkedLevelForDrag(
                drag.kind,
                price,
                open.side,
                open.entryPrice,
                state.riskReward,
                series
              )
            : { linkedPrice: null, linkedY: null }
        setLevelPreview({
          kind: drag.kind,
          price,
          y,
          linkedPrice: linked.linkedPrice,
          linkedY: linked.linkedY
        })
        if (drag.mode === 'move') {
          if (!open) return
          if (drag.kind === 'tp') {
            if (isValidTakeProfit(open.side, open.entryPrice, price)) {
              setTakeProfit(price)
            }
          } else {
            const mark = state.currentCandle?.close
            if (mark != null && isValidStopLoss(open.side, mark, price)) {
              setStopLoss(price)
            }
          }
        }
        return
      }

      if (drag.kind === 'trend' || drag.kind === 'fib' || drag.kind === 'rect') {
        const timeSec = xToUnixTime(chart, x, paneCandlesRef.current, intervalSeconds)
        if (timeSec == null) return
        const point: TrendPoint = { time: timeSec, price }
        drag.moved = true

        if (drag.kind === 'rect') {
          if (drag.handle === 'body') {
            const origin = drag.origin
            if (!origin) return
            moveDrawing(drag.id, origin.drawing, timeSec - origin.time, price - origin.price)
            return
          }
          updateRectHandle(drag.id, drag.handle, point)
          return
        }

        if (drag.end === 'body') {
          const origin = drag.origin
          if (!origin) return
          moveDrawing(drag.id, origin.drawing, timeSec - origin.time, price - origin.price)
          return
        }

        updateTwoPointEndpoint(drag.id, drag.end, point)
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
            const timeSec = xToUnixTime(chart, x, paneCandlesRef.current, intervalSeconds)
            if (price != null && Number.isFinite(price) && timeSec != null) {
              addTwoPoint({ time: timeSec, price })
            } else {
              setDrawTool(drag.tool)
            }
          }
        } else {
          setDrawTool(drag.tool)
        }
        setHover(null)
      }

      if (drag && (drag.kind === 'tp' || drag.kind === 'sl') && drag.mode === 'place') {
        const preview = levelPreviewRef.current
        if (preview && preview.kind === drag.kind) {
          if (drag.kind === 'tp') setTakeProfit(preview.price, { linkRr: true })
          else setStopLoss(preview.price, { linkRr: true })
        }
      }

      dragRef.current = null
      setDraggingKey(null)
      setLevelPreview(null)
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
    updateHorizontalLine,
    updateTwoPointEndpoint,
    updateRectHandle,
    moveDrawing,
    addTwoPoint,
    setDrawTool,
    setTakeProfit,
    setStopLoss,
    intervalSeconds
  ])

  function onClick(event: ReactMouseEvent<SVGSVGElement>): void {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (!placing || drawTool !== 'hline' || !series) return

    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    if (!isInPlotX(x, readPlotRight())) return
    const y = event.clientY - rect.top
    const price = series.coordinateToPrice(y)
    if (price == null || !Number.isFinite(price)) return
    addHorizontalLine(price)
  }

  function onSvgMouseDown(event: ReactMouseEvent<SVGSVGElement>): void {
    if (!canDraw || !isTwoPointTool(drawTool) || event.button !== 0 || !chart || !series) return
    const box = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - box.left
    const y = event.clientY - box.top
    if (!isInPlotX(x, readPlotRight())) return
    const point = pointerAtEvent(event)
    if (!point) return
    event.preventDefault()
    addTwoPoint(point)
    dragRef.current = { kind: 'place-two', tool: drawTool, startX: x, startY: y, moved: false }
    setHover({ x, y })
    setDraggingKey('place-two')
  }

  function onMove(event: ReactMouseEvent<SVGSVGElement>): void {
    if (!placing) {
      setHover(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const plotRight = readPlotRight()
    setHover({
      x: clampXToPlot(event.clientX - rect.left, plotRight),
      y: event.clientY - rect.top
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
    const time = xToUnixTime(chart, clampXToPlot(x, plotRight), paneCandles, intervalSeconds)
    if (price == null || !Number.isFinite(price) || time == null) return null
    return { time, price }
  }

  function startDrag(event: ReactMouseEvent, next: DragState): void {
    const isDrawingDrag =
      next.kind === 'hline' || next.kind === 'trend' || next.kind === 'fib' || next.kind === 'rect'
    const allowed = isDrawingDrag ? canDraw : canEditTrade
    if (!allowed) return
    event.preventDefault()
    event.stopPropagation()

    let drag: DragState = next
    if (isDrawingDrag) {
      const isBody =
        next.kind === 'hline' ||
        (next.kind === 'rect' && next.handle === 'body') ||
        ((next.kind === 'trend' || next.kind === 'fib') && next.end === 'body')

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
    if (drag.kind === 'hline') {
      setDraggingKey(`hline:${drag.id}`)
    } else if (drag.kind === 'trend' || drag.kind === 'fib') {
      setDraggingKey(`${drag.kind}:${drag.id}:${drag.end}`)
    } else if (drag.kind === 'rect') {
      setDraggingKey(`rect:${drag.id}:${drag.handle}`)
    } else if (drag.kind === 'place-two') {
      setDraggingKey('place-two')
    } else {
      setDraggingKey(`${drag.kind}:${drag.mode}`)
      setPlaceHint(null)
      // Seed preview immediately at the entry handle Y so the line appears on drag start.
      if (series && position) {
        const seedY = series.priceToCoordinate(position.entryPrice)
        if (seedY != null) {
          const linked =
            drag.mode === 'place'
              ? linkedLevelForDrag(
                  drag.kind,
                  position.entryPrice,
                  position.side,
                  position.entryPrice,
                  riskReward,
                  series
                )
              : { linkedPrice: null, linkedY: null }
          setLevelPreview({
            kind: drag.kind,
            price: position.entryPrice,
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

  const width = chart?.chartElement()?.clientWidth ?? 0
  const height = chart?.chartElement()?.clientHeight ?? 0
  const priceScaleW = chart?.priceScale('right').width() ?? 56
  const plotRight = plotRightX(width, priceScaleW, chart?.timeScale().width() ?? 0)
  const midX = plotRight / 2
  const rrLabel = formatRiskReward(
    position != null
      ? (realizedRiskReward(
          position.side,
          position.entryPrice,
          position.stopLoss,
          position.takeProfit
        ) ?? riskReward)
      : riskReward
  )

  function toXY(time: number, price: number): Point | null {
    if (!chart || !series) return null
    const x = timeToX(time)
    const y = series.priceToCoordinate(price)
    if (x == null || y == null) return null
    return { x, y }
  }

  const pnlScale = pnlScaleForSymbol(symbol, position?.lots)
  const qtyLabel = formatTradeSizeForSymbol(position?.lots ?? 1, symbol)
  const openPnl =
    position != null ? unrealizedPnl(position, markCandle?.close, pnlScale) : null
  const sideColor =
    position?.side === 'long' ? TRADE_OVERLAY.longLine : TRADE_OVERLAY.shortLine
  const openPnlColor =
    openPnl == null
      ? TRADE_OVERLAY.handleTextMuted
      : openPnl >= 0
        ? TRADE_OVERLAY.pnlProfit
        : TRADE_OVERLAY.pnlLoss

  const tpPrice =
    levelPreview?.kind === 'tp'
      ? levelPreview.price
      : levelPreview?.kind === 'sl' && levelPreview.linkedPrice != null
        ? levelPreview.linkedPrice
        : (position?.takeProfit ?? null)
  const slPrice =
    levelPreview?.kind === 'sl'
      ? levelPreview.price
      : levelPreview?.kind === 'tp' && levelPreview.linkedPrice != null
        ? levelPreview.linkedPrice
        : (position?.stopLoss ?? null)
  const showTpLine = position != null && tpPrice != null
  const showSlLine = position != null && slPrice != null

  const entryY =
    position != null ? series?.priceToCoordinate(position.entryPrice) : null
  const tpY = tpPrice != null ? series?.priceToCoordinate(tpPrice) : null
  const slY = slPrice != null ? series?.priceToCoordinate(slPrice) : null

  const openPnlLabel = formatPnlUsd(openPnl)
  const tpPnl =
    position != null && tpPrice != null
      ? pnlForSide(position.side, position.entryPrice, tpPrice, pnlScale)
      : null
  const slPnl =
    position != null && slPrice != null
      ? pnlForSide(position.side, position.entryPrice, slPrice, pnlScale)
      : null
  const tpPnlLabel = formatPnlUsd(tpPnl)
  const slPnlLabel = formatPnlUsd(slPnl)

  // Sit labels in the blank pane after the last candle, left of the price scale.
  const paneRight = Math.max(0, plotRight - OVERLAY_LAYOUT.rightPad)
  const placeExtra =
    (canEditTrade && position?.takeProfit == null ? OVERLAY_LAYOUT.placeW + OVERLAY_LAYOUT.gap : 0) +
    (canEditTrade && position?.stopLoss == null ? OVERLAY_LAYOUT.placeW + OVERLAY_LAYOUT.gap : 0)
  const entryPillW =
    estimateQtyWidth(qtyLabel) + estimatePnlWidth(openPnlLabel) + OVERLAY_LAYOUT.closeW
  const clusterNeedW = placeExtra + entryPillW
  const playheadCandle = paneCurrentCandle ?? markCandle
  const lastCandleX = playheadCandle ? timeToX(playheadCandle.time) : null
  const afterLast =
    lastCandleX != null && Number.isFinite(lastCandleX) ? lastCandleX + 14 : paneRight - clusterNeedW
  const clusterX = Math.max(8, Math.min(afterLast, paneRight - clusterNeedW))
  const entryPillX = clusterX + placeExtra
  const connectorX = Math.min(paneRight - 2, Math.max(entryPillX + entryPillW + 8, clusterX + clusterNeedW + 8))

  function renderPlaceButton(kind: 'tp' | 'sl', x: number, y: number) {
    const color = kind === 'tp' ? TRADE_OVERLAY.tpLine : TRADE_OVERLAY.slLine
    const label = kind === 'tp' ? 'TP' : 'SL'
    const w = OVERLAY_LAYOUT.placeW
    const h = OVERLAY_LAYOUT.placeH
    return (
      <g
        className="pointer-events-auto cursor-ns-resize"
        onMouseDown={(e) => startDrag(e, { kind, mode: 'place', moved: false })}
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
            <rect
              x={x + qtyW + pnlW}
              y={top}
              width={closeW}
              height={h}
              fill="transparent"
            />
            <CloseGlyph
              cx={x + qtyW + pnlW + closeW / 2}
              cy={y}
              color={closeColor}
            />
          </g>
        )}
      </g>
    )
  }

  return (
    <svg
      className={`absolute left-0 top-0 z-[2] h-full overflow-hidden ${
        placing ? 'cursor-crosshair' : 'pointer-events-none'
      }`}
      width={plotRight || 0}
      height={height || '100%'}
      style={{ width: plotRight }}
      onClick={onClick}
      onMouseDown={onSvgMouseDown}
      onMouseMove={onMove}
      onMouseLeave={() => {
        if (dragRef.current?.kind === 'place-two') return
        setHover(null)
        setPlaceHint(null)
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
              <circle
                cx={to.x}
                cy={to.y}
                r={4.5}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
              />
            )}
          </g>
        )
      })}

      {position && entryY != null && (
        <g key={`open-pos-${position.id}`}>
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
            strokeDasharray={TRADE_OVERLAY.entryDash}
          />

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

            if (canEditTrade && position.takeProfit == null) {
              nodes.push(
                <g key="place-tp">{renderPlaceButton('tp', x, entryY)}</g>
              )
              x += OVERLAY_LAYOUT.placeW + OVERLAY_LAYOUT.gap
            }

            if (canEditTrade && position.stopLoss == null) {
              nodes.push(
                <g key="place-sl">{renderPlaceButton('sl', x, entryY)}</g>
              )
              x += OVERLAY_LAYOUT.placeW + OVERLAY_LAYOUT.gap
            }

            nodes.push(
              <g key="entry-pill">
                {renderActionPill({
                  x,
                  y: entryY,
                  border: sideColor,
                  qtyFill: sideColor,
                  pnlLabel: openPnlLabel,
                  pnlColor: openPnlColor,
                  closeColor: TRADE_OVERLAY.closeIcon,
                  onClose: canEditTrade
                    ? (e) => {
                        stopAction(e)
                        paperClose()
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
            position.takeProfit != null &&
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
                ? (e) => startDrag(e, { kind: 'tp', mode: 'move', moved: false })
                : undefined,
              onClose: canEditTrade
                ? (e) => {
                    stopAction(e)
                    setTakeProfit(null)
                  }
                : undefined
            })}

          {/* Armed SL pill — drag to move, X clears before fill. */}
          {showSlLine &&
            slY != null &&
            position.stopLoss != null &&
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
                ? (e) => startDrag(e, { kind: 'sl', mode: 'move', moved: false })
                : undefined,
              onClose: canEditTrade
                ? (e) => {
                    stopAction(e)
                    setStopLoss(null)
                  }
                : undefined
            })}

          {/* Live preview pills while placing (before commit). */}
          {levelPreview?.kind === 'tp' &&
            position.takeProfit == null &&
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
          {levelPreview?.kind === 'sl' &&
            position.stopLoss == null &&
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
      )}

      {drawings.map((drawing) => {
        if (drawing.type === 'hline') {
          const y = series?.priceToCoordinate(drawing.price)
          if (y == null) return null
          return (
            <HLineShape
              key={drawing.id}
              y={y}
              width={plotRight}
              midX={midX}
              selected={drawing.id === selectedDrawingId}
              canSelect={canSelect}
              canDraw={canDraw}
              onSelect={(e) => selectDrawingOnClick(e, drawing.id)}
              onDrag={(e) => startDrag(e, { kind: 'hline', id: drawing.id, moved: false })}
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
              selected={drawing.id === selectedDrawingId}
              canSelect={canSelect}
              canDraw={canDraw}
              onSelect={(e) => selectDrawingOnClick(e, drawing.id)}
              onDragEnd={(end, e) =>
                startDrag(e, { kind: 'trend', id: drawing.id, end, moved: false })
              }
              onDragBody={(e) =>
                startDrag(e, { kind: 'trend', id: drawing.id, end: 'body', moved: false })
              }
            />
          )
        }

        if (drawing.type === 'fib') {
          const a = toXY(drawing.t1, drawing.p1)
          const b = toXY(drawing.t2, drawing.p2)
          if (!a || !b || !series) return null
          return (
            <FibShape
              key={drawing.id}
              a={a}
              b={b}
              levels={fibLevelsAt(drawing.p1, drawing.p2, (price) =>
                series.priceToCoordinate(price)
              )}
              selected={drawing.id === selectedDrawingId}
              labelColor={chrome.hintText}
              canSelect={canSelect}
              canDraw={canDraw}
              pricePrecision={pricePrecision}
              plotRight={plotRight}
              onSelect={(e) => selectDrawingOnClick(e, drawing.id)}
              onDragEnd={(end, e) =>
                startDrag(e, { kind: 'fib', id: drawing.id, end, moved: false })
              }
              onDragBody={(e) =>
                startDrag(e, { kind: 'fib', id: drawing.id, end: 'body', moved: false })
              }
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
              selected={drawing.id === selectedDrawingId}
              canSelect={canSelect}
              canDraw={canDraw}
              onSelect={(e) => selectDrawingOnClick(e, drawing.id)}
              onDragHandle={(handle, e) =>
                startDrag(e, { kind: 'rect', id: drawing.id, handle, moved: false })
              }
              onDragBody={(e) =>
                startDrag(e, { kind: 'rect', id: drawing.id, handle: 'body', moved: false })
              }
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
                ? fibLevelsAt(pendingTrend.price, hoverPrice, (price) =>
                    series.priceToCoordinate(price)
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
    </svg>
  )
}
