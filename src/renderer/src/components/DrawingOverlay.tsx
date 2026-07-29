import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { ViewportBumpPrimitive } from '@/lib/chart/viewportBumpPrimitive'
import { useReplayStore } from '@/store/replayStore'

type Point = { x: number; y: number }

const DRAW_STROKE = '#f23645'
const DRAW_WIDTH = 2.5
const HANDLE_FILL = '#2962ff'
const HANDLE_STROKE = '#ffffff'

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
  const addHorizontalLine = useReplayStore((s) => s.addHorizontalLine)
  const updateHorizontalLine = useReplayStore((s) => s.updateHorizontalLine)
  const addTrendPoint = useReplayStore((s) => s.addTrendPoint)
  const updateTrendLineEndpoint = useReplayStore((s) => s.updateTrendLineEndpoint)
  const mode = useReplayStore((s) => s.mode)
  const replayStatus = useReplayStore((s) => s.replayStatus)

  const [version, setVersion] = useState(0)
  const [hover, setHover] = useState<Point | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)

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
      if (dragRef.current?.moved) suppressClickRef.current = true
      dragRef.current = null
      setDraggingKey(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [draggingKey, chart, series, updateHorizontalLine, updateTrendLineEndpoint])

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
    setDraggingKey(
      next.kind === 'hline' ? `hline:${next.id}` : `trend:${next.id}:${next.end}`
    )
  }

  // Touch version so React doesn't drop redraw deps for lint.
  void version

  const width = chart?.chartElement()?.clientWidth ?? 0
  const height = chart?.chartElement()?.clientHeight ?? 0
  const midX = (width || 0) / 2

  function toXY(time: number, price: number): Point | null {
    if (!chart || !series) return null
    const x = chart.timeScale().timeToCoordinate(time as Time)
    const y = series.priceToCoordinate(price)
    if (x == null || y == null) return null
    return { x, y }
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
