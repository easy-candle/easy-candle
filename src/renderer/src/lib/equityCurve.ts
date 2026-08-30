import type { ClosedTrade } from '@/lib/paperTrade'

/** One step of the account curve: cumulative realized PnL after a trade closed. */
export type EquityPoint = {
  /** Candle open time the trade exited on, UTC seconds. */
  time: number
  /** Running total of realized PnL at this point. */
  value: number
  /** Trades closed so far, 0 for the starting baseline. */
  tradeCount: number
}

/**
 * Cumulative realized PnL over exit time, starting from a zero baseline at the
 * first entry so the curve shows where the session began.
 *
 * Trades are sorted by exit time: closes can be recorded out of order when TP
 * and SL fire on the same bar. Ties keep their relative order, so the curve
 * matches the trade list.
 */
export function buildEquityCurve(trades: ClosedTrade[]): EquityPoint[] {
  const list = (Array.isArray(trades) ? trades : []).filter(
    (trade) => Number.isFinite(trade.exitTime) && Number.isFinite(trade.pnl)
  )
  if (list.length === 0) return []

  const ordered = [...list].sort((a, b) => a.exitTime - b.exitTime)
  const firstEntry = ordered.reduce(
    (earliest, trade) =>
      Number.isFinite(trade.entryTime) ? Math.min(earliest, trade.entryTime) : earliest,
    ordered[0].exitTime
  )

  const points: EquityPoint[] = [{ time: firstEntry, value: 0, tradeCount: 0 }]
  let running = 0

  for (const [index, trade] of ordered.entries()) {
    running += trade.pnl
    points.push({ time: trade.exitTime, value: running, tradeCount: index + 1 })
  }

  return points
}

export type CurveExtent = {
  minTime: number
  maxTime: number
  minValue: number
  maxValue: number
}

/**
 * Plot bounds for a curve. The value range always includes zero so the baseline
 * is visible, and a flat curve is padded so it does not collapse onto an edge.
 */
export function curveExtent(points: EquityPoint[]): CurveExtent | null {
  if (!Array.isArray(points) || points.length === 0) return null

  let minTime = points[0].time
  let maxTime = points[0].time
  let minValue = Math.min(0, points[0].value)
  let maxValue = Math.max(0, points[0].value)

  for (const point of points) {
    if (point.time < minTime) minTime = point.time
    if (point.time > maxTime) maxTime = point.time
    if (point.value < minValue) minValue = point.value
    if (point.value > maxValue) maxValue = point.value
  }

  if (maxValue === minValue) {
    minValue -= 1
    maxValue += 1
  }
  if (maxTime === minTime) {
    maxTime = minTime + 1
  }

  return { minTime, maxTime, minValue, maxValue }
}

export type PlotBox = {
  width: number
  height: number
  /** Inner padding, leaving room for axis labels drawn outside the plot. */
  padding: { top: number; right: number; bottom: number; left: number }
}

/** Map a curve point to pixel coordinates inside `box`. */
export function projectPoint(
  point: EquityPoint,
  extent: CurveExtent,
  box: PlotBox
): { x: number; y: number } {
  const { padding } = box
  const plotWidth = Math.max(1, box.width - padding.left - padding.right)
  const plotHeight = Math.max(1, box.height - padding.top - padding.bottom)

  const timeSpan = extent.maxTime - extent.minTime || 1
  const valueSpan = extent.maxValue - extent.minValue || 1

  const x = padding.left + ((point.time - extent.minTime) / timeSpan) * plotWidth
  // SVG y grows downward, so the highest value sits at the top padding.
  const y = padding.top + ((extent.maxValue - point.value) / valueSpan) * plotHeight

  return { x, y }
}

/** `points` attribute for an SVG polyline through the whole curve. */
export function curvePolyline(points: EquityPoint[], extent: CurveExtent, box: PlotBox): string {
  return points
    .map((point) => {
      const { x, y } = projectPoint(point, extent, box)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

/** Closed path filling the area between the curve and the zero baseline. */
export function curveAreaPath(points: EquityPoint[], extent: CurveExtent, box: PlotBox): string {
  if (points.length === 0) return ''

  const baseline = projectPoint({ time: 0, value: 0, tradeCount: 0 }, extent, box).y
  const first = projectPoint(points[0], extent, box)
  const last = projectPoint(points[points.length - 1], extent, box)

  const line = points
    .map((point) => {
      const { x, y } = projectPoint(point, extent, box)
      return `L ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')

  return `M ${first.x.toFixed(2)} ${baseline.toFixed(2)} ${line} L ${last.x.toFixed(2)} ${baseline.toFixed(2)} Z`
}

/**
 * Evenly spaced value ticks across the extent, always including zero so the
 * baseline is labelled. Returns 3 ticks: min, zero-anchored middle, and max.
 */
export function valueTicks(extent: CurveExtent): number[] {
  const { minValue, maxValue } = extent
  const ticks = new Set<number>([minValue, maxValue])
  if (minValue < 0 && maxValue > 0) ticks.add(0)
  else ticks.add((minValue + maxValue) / 2)
  return [...ticks].sort((a, b) => b - a)
}
