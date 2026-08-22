import type { LogicalRange } from 'lightweight-charts'
import type { Candle } from '@shared/candleUtils'
import { logicalToUnixTime } from './drawingTimeScale'

/** Bars from either end of the series that still count as "at the edge". */
export const DEFAULT_EDGE_THRESHOLD = 10

export type VisibleRangeInfo = {
  /** Logical index of the leftmost visible slot; negative left of the first candle. */
  from: number
  /** Logical index of the rightmost visible slot; past the last candle when scrolled right. */
  to: number
  /** Empty slots visible before the first loaded candle. */
  barsBefore: number
  /** Empty slots visible after the last loaded candle. */
  barsAfter: number
  /** Viewport reached (or is within `threshold` bars of) the oldest loaded candle. */
  atStart: boolean
  /** Viewport reached (or is within `threshold` bars of) the newest loaded candle. */
  atEnd: boolean
  /** UTC seconds at the left edge, extrapolated outside the series. */
  fromTime: number | null
  /** UTC seconds at the right edge, extrapolated outside the series. */
  toTime: number | null
}

/**
 * Turn a LogicalRangeChangeEventHandler payload into the numbers a range-based
 * loader needs: how far past each end the viewport sits, and the UTC window.
 */
export function describeVisibleRange(
  range: LogicalRange | null,
  candles: Candle[],
  intervalSeconds: number,
  threshold: number = DEFAULT_EDGE_THRESHOLD
): VisibleRangeInfo | null {
  if (!range) return null

  const from = Number(range.from)
  const to = Number(range.to)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null

  const lastIndex = candles.length - 1
  const edge = Math.max(0, Math.floor(threshold) || 0)

  return {
    from,
    to,
    barsBefore: Math.max(0, -from),
    barsAfter: candles.length === 0 ? 0 : Math.max(0, to - lastIndex),
    atStart: candles.length > 0 && from <= edge,
    atEnd: candles.length > 0 && to >= lastIndex - edge,
    fromTime: logicalToUnixTime(from, candles, intervalSeconds),
    toTime: logicalToUnixTime(to, candles, intervalSeconds)
  }
}

/**
 * Identity of the current "oldest loaded candle" edge, so an edge callback can
 * fire once per loaded series instead of on every scroll frame.
 */
export function historyEdgeKey(info: VisibleRangeInfo | null, candles: Candle[]): string | null {
  if (!info || !info.atStart || candles.length === 0) return null
  return `${candles.length}:${candles[0].time}`
}
