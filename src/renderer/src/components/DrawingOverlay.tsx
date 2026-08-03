import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { ViewportBumpPrimitive } from '@/lib/chart/viewportBumpPrimitive'
import { formatPnl, isValidStopLoss, isValidTakeProfit, unrealizedPnl } from '@/lib/paperTrade'
import { TRADE_OVERLAY } from '@/lib/tradeOverlayStyles'
import { useReplayStore } from '@/store/replayStore'

type Point = { x: number; y: number }

const DRAW_STROKE = '#f23645'
const DRAW_WIDTH = 2.5
const HANDLE_FILL = '#2962ff'
const HANDLE_STROKE = '#ffffff'

const POSITION_HANDLE_W = 72
const POSITION_HANDLE_H = 22
const LEVEL_GRIP_W = 28
const LEVEL_GRIP_H = 16
const RIGHT_PAD = 8

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

type DragState =
  | { kind: 'hline'; id: string; moved: boolean }
  | { kind: 'trend'; id: string; end: 'start' | 'end'; moved: boolean }
  | { kind: 'tp' | 'sl'; mode: 'place' | 'move'; moved: boolean }

type DrawingOverlayProps = {
  chart: IChartApi | null
  series: ISeriesApi<'Candlestick'> | null
}

/** SVG drawing layer synced to lightweight-charts pan/zoom. */
export default function DrawingOverlay({ chart, series }: DrawingOverlayProps) {
  const drawings = useReplayStore((s) => s.drawings)
  const drawTool = useReplayStore((s) => s.drawTool)
  const pendingTrend = useReplayStore((s) => s.pendingTrend)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const position = useReplayStore((s) => s.position)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const addHorizontalLine = useReplayStore((s) => s.addHorizontalLine)
  const updateHorizontalLine = useReplayStore((s) => s.updateHorizontalLine)
  const addTrendPoint = useReplayStore((s) => s.addTrendPoint)
  const updateTrendLineEndpoint = useReplayStore((s) => s.updateTrendLineEndpoint)
  const setTakeProfit = useReplayStore((s) => s.setTakeProfit)
  const setStopLoss = useReplayStore((s) => s.setStopLoss)
  const mode = useReplayStore((s) => s.mode)
  const replayStatus = useReplayStore((s) => s.replayStatus)

  const [version, setVersion] = useState(0)
  const [hover, setHover] = useState<Point | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const [levelPreview, setLevelPreview] = useState<{
    kind: 'tp' | 'sl'
    price: number
    y: number
  } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)
  const levelPreviewRef = useRef(levelPreview)
  levelPreviewRef.current = levelPreview

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

  const canEdit = mode === 'replay' && replayStatus !== 'ended'

  const placing = canEdit && (drawTool === 'hline' || drawTool === 'trendline')

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
        setLevelPreview({ kind: drag.kind, price, y })
        if (drag.mode === 'move') {
          const open = useReplayStore.getState().position
          if (!open) return
          if (drag.kind === 'tp') {
            if (isValidTakeProfit(open.side, open.entryPrice, price)) {
              setTakeProfit(price)
            }
          } else if (isValidStopLoss(open.side, open.entryPrice, price)) {
            setStopLoss(price)
          }
        }
        return
      }

      if (drag.kind !== 'trend') return

      const time = chart.timeScale().coordinateToTime(x)
      if (time == null) return
      const timeSec = typeof time === 'number' ? time : Number(time)
      if (!Number.isFinite(timeSec)) return
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
          if (drag.kind === 'tp') setTakeProfit(preview.price)
          else setStopLoss(preview.price)
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
    setStopLoss
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
    const time = chart.timeScale().coordinateToTime(x)

    if (price == null || time == null) return

    const timeSec = typeof time === 'number' ? time : Number(time)
    if (!Number.isFinite(timeSec) || !Number.isFinite(price)) return

    if (drawTool === 'hline') {
      addHorizontalLine(price)
      return
    }

    if (drawTool === 'trendline') {
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
    if (!canEdit) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = next
    if (next.kind === 'hline') {
      setDraggingKey(`hline:${next.id}`)
    } else if (next.kind === 'trend') {
      setDraggingKey(`trend:${next.id}:${next.end}`)
    } else {
      setDraggingKey(`${next.kind}:${next.mode}`)
      // Seed preview immediately at the entry handle Y so the line appears on drag start.
      if (series && position) {
        const seedY = series.priceToCoordinate(position.entryPrice)
        if (seedY != null) {
          setLevelPreview({
            kind: next.kind,
            price: position.entryPrice,
            y: seedY
          })
        }
      }
    }
  }

  // Touch version so React doesn't drop redraw deps for lint.
  void version

  const width = chart?.chartElement()?.clientWidth ?? 0
  const height = chart?.chartElement()?.clientHeight ?? 0
  const midX = (width || 0) / 2
  const rightHandleX = Math.max(0, (width || 0) - RIGHT_PAD - POSITION_HANDLE_W)

  function toXY(time: number, price: number): Point | null {
    if (!chart || !series) return null
    const x = chart.timeScale().timeToCoordinate(time as Time)
    const y = series.priceToCoordinate(price)
    if (x == null || y == null) return null
    return { x, y }
  }

  const openPnl =
    position != null ? unrealizedPnl(position, currentCandle?.close) : null
  const sideColor =
    position?.side === 'long' ? TRADE_OVERLAY.longLine : TRADE_OVERLAY.shortLine
  const pnlColor =
    openPnl == null
      ? TRADE_OVERLAY.handleTextMuted
      : openPnl >= 0
        ? TRADE_OVERLAY.pnlProfit
        : TRADE_OVERLAY.pnlLoss

  const previewKind = levelPreview?.kind
  const showTpLine =
    position != null &&
    (position.takeProfit != null ||
      (levelPreview != null && previewKind === 'tp'))
  const showSlLine =
    position != null &&
    (position.stopLoss != null ||
      (levelPreview != null && previewKind === 'sl'))

  const tpPrice =
    levelPreview?.kind === 'tp'
      ? levelPreview.price
      : (position?.takeProfit ?? null)
  const slPrice =
    levelPreview?.kind === 'sl'
      ? levelPreview.price
      : (position?.stopLoss ?? null)

  const entryY =
    position != null ? series?.priceToCoordinate(position.entryPrice) : null
  const tpY = tpPrice != null ? series?.priceToCoordinate(tpPrice) : null
  const slY = slPrice != null ? series?.priceToCoordinate(slPrice) : null

  return (
    <svg
      className={`absolute inset-0 z-[2] h-full w-full ${
        placing ? 'cursor-crosshair' : 'pointer-events-none'
      }`}
      width={width || '100%'}
      height={height || '100%'}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
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
                  strokeWidth={1.75}
                  strokeOpacity={0.9}
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
            <g>
              <line
                x1={0}
                x2={width || '100%'}
                y1={tpY}
                y2={tpY}
                stroke={TRADE_OVERLAY.tpLine}
                strokeWidth={TRADE_OVERLAY.levelWidth}
                strokeDasharray={TRADE_OVERLAY.levelDash}
              />
              {canEdit && position.takeProfit != null && (
                <g
                  className="pointer-events-auto cursor-ns-resize"
                  onMouseDown={(e) =>
                    startDrag(e, { kind: 'tp', mode: 'move', moved: false })
                  }
                >
                  <rect
                    x={rightHandleX}
                    y={tpY - LEVEL_GRIP_H / 2}
                    width={LEVEL_GRIP_W}
                    height={LEVEL_GRIP_H}
                    rx={2}
                    ry={2}
                    fill={TRADE_OVERLAY.handleFill}
                    stroke={TRADE_OVERLAY.tpLine}
                    strokeWidth={1.25}
                  />
                  <text
                    x={rightHandleX + LEVEL_GRIP_W / 2}
                    y={tpY + 3.5}
                    textAnchor="middle"
                    fill={TRADE_OVERLAY.tpLine}
                    fontSize={9}
                    fontFamily="Tahoma, Arial, sans-serif"
                    fontWeight={700}
                    className="pointer-events-none select-none"
                  >
                    tp
                  </text>
                </g>
              )}
            </g>
          )}

          {showSlLine && slY != null && (
            <g>
              <line
                x1={0}
                x2={width || '100%'}
                y1={slY}
                y2={slY}
                stroke={TRADE_OVERLAY.slLine}
                strokeWidth={TRADE_OVERLAY.levelWidth}
                strokeDasharray={TRADE_OVERLAY.levelDash}
              />
              {canEdit && position.stopLoss != null && (
                <g
                  className="pointer-events-auto cursor-ns-resize"
                  onMouseDown={(e) =>
                    startDrag(e, { kind: 'sl', mode: 'move', moved: false })
                  }
                >
                  <rect
                    x={rightHandleX}
                    y={slY - LEVEL_GRIP_H / 2}
                    width={LEVEL_GRIP_W}
                    height={LEVEL_GRIP_H}
                    rx={2}
                    ry={2}
                    fill={TRADE_OVERLAY.handleFill}
                    stroke={TRADE_OVERLAY.slLine}
                    strokeWidth={1.25}
                  />
                  <text
                    x={rightHandleX + LEVEL_GRIP_W / 2}
                    y={slY + 3.5}
                    textAnchor="middle"
                    fill={TRADE_OVERLAY.slLine}
                    fontSize={9}
                    fontFamily="Tahoma, Arial, sans-serif"
                    fontWeight={700}
                    className="pointer-events-none select-none"
                  >
                    sl
                  </text>
                </g>
              )}
            </g>
          )}

          {/* Entry PNL handle + nested TP/SL place grips (right blank area). */}
          <g>
            <rect
              x={rightHandleX}
              y={entryY - POSITION_HANDLE_H / 2}
              width={POSITION_HANDLE_W}
              height={POSITION_HANDLE_H}
              rx={2}
              ry={2}
              fill={TRADE_OVERLAY.handleFill}
              stroke={sideColor}
              strokeWidth={1.5}
            />
            <text
              x={rightHandleX + POSITION_HANDLE_W / 2}
              y={entryY + 3.5}
              textAnchor="middle"
              fill={pnlColor}
              fontSize={10}
              fontFamily="Tahoma, Arial, sans-serif"
              fontWeight={700}
              className="pointer-events-none select-none"
            >
              {formatPnl(openPnl)}
            </text>

            {canEdit &&
              (() => {
                const isLong = position.side === 'long'
                const aboveRectY = entryY - LEVEL_GRIP_H - 2
                const belowRectY = entryY + 2
                const tpRectY = isLong ? aboveRectY : belowRectY
                const slRectY = isLong ? belowRectY : aboveRectY
                const gripX = rightHandleX - LEVEL_GRIP_W - 4
                const gripTextX = rightHandleX - LEVEL_GRIP_W / 2 - 4

                return (
                  <>
                    {position.takeProfit == null && (
                      <g
                        className="pointer-events-auto cursor-ns-resize"
                        onMouseDown={(e) =>
                          startDrag(e, { kind: 'tp', mode: 'place', moved: false })
                        }
                      >
                        <rect
                          x={gripX}
                          y={tpRectY}
                          width={LEVEL_GRIP_W}
                          height={LEVEL_GRIP_H}
                          rx={2}
                          ry={2}
                          fill={TRADE_OVERLAY.handleFill}
                          stroke={TRADE_OVERLAY.tpLine}
                          strokeWidth={1.1}
                        />
                        <text
                          x={gripTextX}
                          y={tpRectY + LEVEL_GRIP_H / 2 + 3.5}
                          textAnchor="middle"
                          fill={TRADE_OVERLAY.tpLine}
                          fontSize={9}
                          fontFamily="Tahoma, Arial, sans-serif"
                          fontWeight={700}
                          className="pointer-events-none select-none"
                        >
                          tp
                        </text>
                      </g>
                    )}

                    {position.stopLoss == null && (
                      <g
                        className="pointer-events-auto cursor-ns-resize"
                        onMouseDown={(e) =>
                          startDrag(e, { kind: 'sl', mode: 'place', moved: false })
                        }
                      >
                        <rect
                          x={gripX}
                          y={slRectY}
                          width={LEVEL_GRIP_W}
                          height={LEVEL_GRIP_H}
                          rx={2}
                          ry={2}
                          fill={TRADE_OVERLAY.handleFill}
                          stroke={TRADE_OVERLAY.slLine}
                          strokeWidth={1.1}
                        />
                        <text
                          x={gripTextX}
                          y={slRectY + LEVEL_GRIP_H / 2 + 3.5}
                          textAnchor="middle"
                          fill={TRADE_OVERLAY.slLine}
                          fontSize={9}
                          fontFamily="Tahoma, Arial, sans-serif"
                          fontWeight={700}
                          className="pointer-events-none select-none"
                        >
                          sl
                        </text>
                      </g>
                    )}
                  </>
                )
              })()}
          </g>
        </g>
      )}

      {drawings.map((drawing) => {
        if (drawing.type === 'hline') {
          const y = series?.priceToCoordinate(drawing.price)
          if (y == null) return null
          return (
            <g key={drawing.id}>
              <line
                x1={0}
                x2={width || '100%'}
                y1={y}
                y2={y}
                stroke={DRAW_STROKE}
                strokeWidth={DRAW_WIDTH}
              />
              {canEdit && midX > 0 && (
                <rect
                  x={midX - 4.5}
                  y={y - 4.5}
                  width={9}
                  height={9}
                  rx={2}
                  ry={2}
                  fill={HANDLE_FILL}
                  stroke={HANDLE_STROKE}
                  strokeWidth={1.25}
                  className="pointer-events-auto cursor-ns-resize"
                  onMouseDown={(e) =>
                    startDrag(e, { kind: 'hline', id: drawing.id, moved: false })
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
          return (
            <g key={drawing.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={DRAW_STROKE}
                strokeWidth={DRAW_WIDTH}
              />
              {canEdit && (
                <>
                  <circle
                    cx={a.x}
                    cy={a.y}
                    r={4.5}
                    fill={HANDLE_FILL}
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
                  />
                  <circle
                    cx={b.x}
                    cy={b.y}
                    r={4.5}
                    fill={HANDLE_FILL}
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
