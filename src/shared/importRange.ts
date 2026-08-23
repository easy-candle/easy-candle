import { findIndexAtOrBefore, type Candle } from './candleUtils'
import type { DatasetLoadRange, DatasetLoadedWindow } from './datasetTypes'

function normalizeTime(value: unknown): number | null {
  if (value == null) return null
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return null
  return n
}

function normalizeLimit(value: unknown): number | null {
  if (value == null) return null
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function emptyWindow(totalCount: number): DatasetLoadedWindow {
  return {
    loadedFrom: 0,
    loadedTo: 0,
    hasMoreBefore: false,
    hasMoreAfter: false,
    totalCount
  }
}

/**
 * Cut a UTC-second window out of a stored import series.
 *
 * `startTime` / `endTime` are inclusive bounds. `limit` caps the bar count and
 * is anchored to the side the caller asked from: with `startTime` the first
 * `limit` bars are kept (paging forward), otherwise the last `limit` bars
 * before `endTime` (or the series end) are kept — the tail a chart needs first.
 *
 * Candles must be sorted ascending by `time`.
 */
export function sliceCandleRange(
  candles: Candle[],
  range?: DatasetLoadRange | null
): { candles: Candle[]; window: DatasetLoadedWindow } {
  const total = Array.isArray(candles) ? candles.length : 0
  if (total === 0) return { candles: [], window: emptyWindow(0) }

  const startTime = normalizeTime(range?.startTime)
  const endTime = normalizeTime(range?.endTime)
  const limit = normalizeLimit(range?.limit)

  let lo = 0
  let hi = total - 1

  // Times are integer seconds, so `>= startTime` is `> startTime - 1`.
  if (startTime != null) lo = findIndexAtOrBefore(candles, startTime - 1) + 1
  if (endTime != null) hi = findIndexAtOrBefore(candles, endTime)

  if (hi < lo) {
    return {
      candles: [],
      window: {
        ...emptyWindow(total),
        hasMoreBefore: lo > 0,
        hasMoreAfter: hi < total - 1
      }
    }
  }

  if (limit != null && hi - lo + 1 > limit) {
    if (startTime != null) {
      hi = lo + limit - 1
    } else {
      lo = hi - limit + 1
    }
  }

  return {
    candles: candles.slice(lo, hi + 1),
    window: {
      loadedFrom: candles[lo].time,
      loadedTo: candles[hi].time,
      hasMoreBefore: lo > 0,
      hasMoreAfter: hi < total - 1,
      totalCount: total
    }
  }
}
