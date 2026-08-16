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
  isTimeInSeriesRange,
  logicalToX,
  unixTimeToLogical,
  xToUnixTime
} from '@/lib/chart/drawingTimeScale'
import {
  formatPnlUsd,
  formatRiskReward,
  isValidStopLoss,
  isValidTakeProfit,
  pnlForSide,
  realizedRiskReward,
  stopLossFromTakeProfit,
  takeProfitFromStopLoss,
  unrealizedPnl
} from '@/lib/paperTrade'
import { OVERLAY_LAYOUT, TRADE_OVERLAY } from '@/lib/tradeOverlayStyles'
import { alignTimeToInterval, DEFAULT_TIMEFRAME, TIMEFRAMES } from '@shared/timeframes'
import type { Candle } from '@shared/candleUtils'
import { useReplayStore } from '@/store/replayStore'

type Point = { x: number; y: number }

const DRAW_STROKE = '#f23645'
const DRAW_WIDTH = 2.5
const HANDLE_FILL = '#2962ff'
const HANDLE_STROKE = '#ffffff'
const SELECT_STROKE = '#f59e0b'

type DragState =
  | { kind: 'hline'; id: string; moved: boolean }
  | { kind: 'trend'; id: string; end: 'start' | 'end'; moved: boolean }
  | { kind: 'tp' | 'sl'; mode: 'place' | 'move'; moved: boolean }

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
  paneCandles = []
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
  const addTrendPoint = useReplayStore((s) => s.addTrendPoint)
  const updateTrendLineEndpoint = useReplayStore((s) => s.updateTrendLineEndpoint)
  const selectDrawing = useReplayStore((s) => s.selectDrawing)
  const setTakeProfit = useReplayStore((s) => s.setTakeProfit)
  const setStopLoss = useReplayStore((s) => s.setStopLoss)
  const paperClose = useReplayStore((s) => s.paperClose)
  const mode = useReplayStore((s) => s.mode)
  const replayStatus = useReplayStore((s) => s.replayStatus)

  const intervalSeconds =
    TIMEFRAMES[paneTimeframe || '']?.seconds ?? TIMEFRAMES[DEFAULT_TIMEFRAME].seconds

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

  const placing = canDraw && (drawTool === 'hline' || drawTool === 'trendline')

  // Document-level drag so handles stay under the cursor outside the SVG.
  useEffect(() => {
    if (!draggingKey || !series || !chart) return undefined

    function onMove(event: MouseEvent): void {
      const drag = dragRef.current
      if (!drag || !series || !chart) return
      const el = chart.chartElement()
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
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

      if (drag.kind !== 'trend') return

      const timeSec = xToUnixTime(chart, x, paneCandlesRef.current, intervalSeconds)
      if (timeSec == null) return
      drag.moved = true
      updateTrendLineEndpoint(drag.id, drag.end, {
        time: timeSec,
        price
      })
    }

    function onUp(): void {
      const drag = dragRef.current
      if (drag?.moved) suppressClickRef.current = true

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
    updateTrendLineEndpoint,
    setTakeProfit,
    setStopLoss,
    intervalSeconds
  ])

  function onClick(event: ReactMouseEvent<SVGSVGElement>): void {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (!placing || !chart || !series) return

    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const price = series.coordinateToPrice(y)
    if (price == null || !Number.isFinite(price)) return

    if (drawTool === 'hline') {
      addHorizontalLine(price)
      return
    }

    if (drawTool === 'trendline') {
      const timeSec = xToUnixTime(chart, x, paneCandles, intervalSeconds)
      if (timeSec == null) return
      addTrendPoint({ time: timeSec, price })
    }
  }

  function onMove(event: ReactMouseEvent<SVGSVGElement>): void {
    if (!placing) {
      setHover(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    setHover({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    })
  }

  function startDrag(event: ReactMouseEvent, next: DragState): void {
    const allowed = next.kind === 'hline' || next.kind === 'trend' ? canDraw : canEditTrade
    if (!allowed) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = next
    if (next.kind === 'hline') {
      setDraggingKey(`hline:${next.id}`)
    } else if (next.kind === 'trend') {
      setDraggingKey(`trend:${next.id}:${next.end}`)
    } else {
      setDraggingKey(`${next.kind}:${next.mode}`)
      setPlaceHint(null)
      // Seed preview immediately at the entry handle Y so the line appears on drag start.
      if (series && position) {
        const seedY = series.priceToCoordinate(position.entryPrice)
        if (seedY != null) {
          const linked =
            next.mode === 'place'
              ? linkedLevelForDrag(
                  next.kind,
                  position.entryPrice,
                  position.side,
                  position.entryPrice,
                  riskReward,
                  series
                )
              : { linkedPrice: null, linkedY: null }
          setLevelPreview({
            kind: next.kind,
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
  const midX = (width || 0) / 2
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

  const openPnl =
    position != null ? unrealizedPnl(position, markCandle?.close) : null
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
      ? pnlForSide(position.side, position.entryPrice, tpPrice)
      : null
  const slPnl =
    position != null && slPrice != null
      ? pnlForSide(position.side, position.entryPrice, slPrice)
      : null
  const tpPnlLabel = formatPnlUsd(tpPnl)
  const slPnlLabel = formatPnlUsd(slPnl)

  // Sit labels in the blank pane after the last candle, left of the price scale.
  const priceScaleW = chart?.priceScale('right').width() ?? 56
  const paneRight = Math.max(0, (width || 0) - priceScaleW - OVERLAY_LAYOUT.rightPad)
  const placeExtra =
    (canEditTrade && position?.takeProfit == null ? OVERLAY_LAYOUT.placeW + OVERLAY_LAYOUT.gap : 0) +
    (canEditTrade && position?.stopLoss == null ? OVERLAY_LAYOUT.placeW + OVERLAY_LAYOUT.gap : 0)
  const entryPillW =
    OVERLAY_LAYOUT.qtyW + estimatePnlWidth(openPnlLabel) + OVERLAY_LAYOUT.closeW
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
          fill={TRADE_OVERLAY.handleFill}
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
              fill="#1a1d24"
              stroke="#3f4654"
              strokeWidth={1}
            />
            <text
              x={x + w - (kind === 'tp' ? 118 : 112) + 8}
              y={y - h / 2 - 9.5}
              fill="#e5e7eb"
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
      pnlLabel,
      pnlColor,
      closeColor,
      onClose,
      onDragStart,
      dragCursor
    } = opts
    const h = OVERLAY_LAYOUT.pillH
    const qtyW = OVERLAY_LAYOUT.qtyW
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
          fill={TRADE_OVERLAY.handleFill}
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
          1
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
      className={`absolute inset-0 z-[2] h-full w-full ${
        placing ? 'cursor-crosshair' : 'pointer-events-none'
      }`}
      width={width || '100%'}
      height={height || '100%'}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={() => {
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
              width={width || '100%'}
              height={Math.abs(slY - entryY)}
              fill={TRADE_OVERLAY.zoneSl}
              className="pointer-events-none"
            />
          )}
          {showTpLine && tpY != null && (
            <rect
              x={0}
              y={Math.min(entryY, tpY)}
              width={width || '100%'}
              height={Math.abs(tpY - entryY)}
              fill={TRADE_OVERLAY.zoneTp}
              className="pointer-events-none"
            />
          )}

          <line
            x1={0}
            x2={width || '100%'}
            y1={entryY}
            y2={entryY}
            stroke={sideColor}
            strokeWidth={TRADE_OVERLAY.entryWidth}
            strokeDasharray={TRADE_OVERLAY.entryDash}
          />

          {showTpLine && tpY != null && (
            <line
              x1={0}
              x2={width || '100%'}
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
              x2={width || '100%'}
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
                  fill={TRADE_OVERLAY.handleFill}
                  stroke={TRADE_OVERLAY.connector}
                  strokeWidth={1.25}
                />
              )}
              {showSlLine && slY != null && (
                <circle
                  cx={connectorX}
                  cy={slY}
                  r={OVERLAY_LAYOUT.connectorR}
                  fill={TRADE_OVERLAY.handleFill}
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
          const selected = drawing.id === selectedDrawingId
          return (
            <g key={drawing.id}>
              <line
                x1={0}
                x2={width || '100%'}
                y1={y}
                y2={y}
                stroke={selected ? SELECT_STROKE : DRAW_STROKE}
                strokeWidth={DRAW_WIDTH}
              />
              {canSelect && (
                <line
                  x1={0}
                  x2={width || '100%'}
                  y1={y}
                  y2={y}
                  stroke="transparent"
                  strokeWidth={14}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => selectDrawingOnClick(e, drawing.id)}
                />
              )}
              {canDraw && midX > 0 && (
                <rect
                  x={midX - 4.5}
                  y={y - 4.5}
                  width={9}
                  height={9}
                  rx={2}
                  ry={2}
                  fill={selected ? SELECT_STROKE : HANDLE_FILL}
                  stroke={HANDLE_STROKE}
                  strokeWidth={1.25}
                  className="pointer-events-auto cursor-ns-resize"
                  onMouseDown={(e) =>
                    startDrag(e, { kind: 'hline', id: drawing.id, moved: false })
                  }
                  onClick={
                    canSelect ? (e) => selectDrawingOnClick(e, drawing.id) : undefined
                  }
                />
              )}
            </g>
          )
        }

        if (drawing.type === 'trendline') {
          const a = toXY(drawing.t1, drawing.p1)
          const b = toXY(drawing.t2, drawing.p2)
          if (!a || !b) return null
          const selected = drawing.id === selectedDrawingId
          return (
            <g key={drawing.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={selected ? SELECT_STROKE : DRAW_STROKE}
                strokeWidth={DRAW_WIDTH}
              />
              {canSelect && (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={14}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => selectDrawingOnClick(e, drawing.id)}
                />
              )}
              {canDraw && (
                <>
                  <circle
                    cx={a.x}
                    cy={a.y}
                    r={4.5}
                    fill={selected ? SELECT_STROKE : HANDLE_FILL}
                    stroke={HANDLE_STROKE}
                    strokeWidth={1.25}
                    className="pointer-events-auto cursor-move"
                    onMouseDown={(e) =>
                      startDrag(e, {
                        kind: 'trend',
                        id: drawing.id,
                        end: 'start',
                        moved: false
                      })
                    }
                    onClick={
                      canSelect ? (e) => selectDrawingOnClick(e, drawing.id) : undefined
                    }
                  />
                  <circle
                    cx={b.x}
                    cy={b.y}
                    r={4.5}
                    fill={selected ? SELECT_STROKE : HANDLE_FILL}
                    stroke={HANDLE_STROKE}
                    strokeWidth={1.25}
                    className="pointer-events-auto cursor-move"
                    onMouseDown={(e) =>
                      startDrag(e, {
                        kind: 'trend',
                        id: drawing.id,
                        end: 'end',
                        moved: false
                      })
                    }
                    onClick={
                      canSelect ? (e) => selectDrawingOnClick(e, drawing.id) : undefined
                    }
                  />
                </>
              )}
            </g>
          )
        }

        return null
      })}

      {pendingTrend &&
        (() => {
          const a = toXY(pendingTrend.time, pendingTrend.price)
          if (!a) return null
          return (
            <g key="pending">
              <circle
                cx={a.x}
                cy={a.y}
                r={4.5}
                fill={HANDLE_FILL}
                stroke={HANDLE_STROKE}
                strokeWidth={1.25}
              />
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
