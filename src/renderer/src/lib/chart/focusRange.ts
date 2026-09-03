import type { IChartApi } from 'lightweight-charts'
import type { Candle } from '@shared/candleUtils'
import { isTimeInSeriesRange, unixTimeToLogical } from './drawingTimeScale'

/** Bars kept on either side of a focused bar; the viewport spans twice this. */
export const DEFAULT_FOCUS_BARS = 50

/** Context bars loaded before a focus target when paging older history in. */
export const FOCUS_LOOKBACK_BARS = 80

export type LogicalRangeBounds = { from: number; to: number }

/**
 * Viewport centered on `logical`, clamped so it never starts left of the first
 * bar. Empty space past the newest bar is allowed, mirroring how the chart
 * focuses the latest candle.
 */
export function focusLogicalRange(
  logical: number,
  candleCount: number,
  barsEitherSide: number = DEFAULT_FOCUS_BARS
): LogicalRangeBounds | null {
  if (candleCount <= 0 || !Number.isFinite(logical)) return null

  const span = Math.max(1, Math.floor(barsEitherSide) || 0)
  const target = Math.min(Math.max(logical, 0), candleCount - 1)
  const from = Math.max(0, target - span)

  return { from, to: from + span * 2 }
}

/**
 * Viewport that brings a UTC time into view. Returns null when the time is not
 * on this series, so a pane that cannot show the target leaves its view alone
 * instead of scrolling to an unrelated edge.
 */
export function focusRangeForTime(
  time: number,
  candles: Candle[],
  intervalSeconds: number,
  barsEitherSide: number = DEFAULT_FOCUS_BARS
): LogicalRangeBounds | null {
  if (!isTimeInSeriesRange(time, candles, intervalSeconds)) return null
  const logical = unixTimeToLogical(time, candles, intervalSeconds)
  if (logical == null) return null
  return focusLogicalRange(logical, candles.length, barsEitherSide)
}

/**
 * Half of the viewport's current bar span, so focusing a time keeps the zoom
 * the user set. Falls back to the default when the chart has no range yet.
 */
export function currentFocusBars(chart: IChartApi, fallback: number = DEFAULT_FOCUS_BARS): number {
  const range = chart.timeScale().getVisibleLogicalRange()
  if (!range) return fallback
  const span = Number(range.to) - Number(range.from)
  if (!Number.isFinite(span) || span <= 0) return fallback
  return Math.max(1, Math.round(span / 2))
}

/**
 * Bars a loader must prepend to bring `target` onto a series that currently
 * starts at `oldestLoadedTime`, including `lookbackBars` of context before it.
 *
 * Zero means the target is already loaded. For series with gaps (weekends,
 * session breaks) this over-counts, so callers treating it as a budget bail
 * conservatively rather than issuing an unbounded fetch.
 */
export function focusHistoryBars(
  target: number,
  oldestLoadedTime: number,
  intervalSeconds: number,
  lookbackBars = 0
): number {
  const interval = Math.floor(intervalSeconds)
  if (!Number.isFinite(target) || !Number.isFinite(oldestLoadedTime) || interval <= 0) return 0
  if (target >= oldestLoadedTime) return 0

  const from = target - Math.max(0, Math.floor(lookbackBars)) * interval
  return Math.ceil((oldestLoadedTime - from) / interval)
}
