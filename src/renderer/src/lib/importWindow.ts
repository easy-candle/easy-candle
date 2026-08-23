import type { DatasetLoadRange, DatasetLoadedWindow } from '@shared/datasetTypes'

/** Bars kept on the live chart for an imported dataset (newest tail). */
export const IMPORT_LIVE_WINDOW_BARS = 1500

/** Bars pulled in when the viewport reaches the oldest loaded candle. */
export const IMPORT_HISTORY_PAGE_BARS = 1000

/** Bars loaded before an imported replay start (context left of the playhead). */
export const IMPORT_REPLAY_LOOKBACK_BARS = 200

/** Bars loaded after an imported replay start. */
export const IMPORT_REPLAY_FORWARD_BARS = 1000

/** Batch size when extending an imported replay buffer during play. */
export const IMPORT_PREFETCH_BATCH_BARS = 1000

function positiveInt(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Newest `limit` bars — the window a chart shows right after loading. */
export function tailRange(limit = IMPORT_LIVE_WINDOW_BARS): DatasetLoadRange {
  return { limit: positiveInt(limit, IMPORT_LIVE_WINDOW_BARS) }
}

/**
 * Page older bars: the `limit` bars ending just before `oldestLoadedTime`.
 * Times are integer seconds, so the exclusive bound is `oldestLoadedTime - 1`.
 */
export function historyRange(
  oldestLoadedTime: number,
  limit = IMPORT_HISTORY_PAGE_BARS
): DatasetLoadRange {
  const oldest = Math.floor(Number(oldestLoadedTime))
  return {
    endTime: Number.isFinite(oldest) ? oldest - 1 : 0,
    limit: positiveInt(limit, IMPORT_HISTORY_PAGE_BARS)
  }
}

/** Page newer bars: the `limit` bars starting just after `newestLoadedTime`. */
export function forwardRange(
  newestLoadedTime: number,
  limit = IMPORT_PREFETCH_BATCH_BARS
): DatasetLoadRange {
  const newest = Math.floor(Number(newestLoadedTime))
  return {
    startTime: Number.isFinite(newest) ? newest + 1 : 0,
    limit: positiveInt(limit, IMPORT_PREFETCH_BATCH_BARS)
  }
}

/**
 * Window around a replay start: `lookbackBars` of context before it plus
 * `forwardBars` to play through. Anchored on the lookback start so the limit
 * fills forward from there; gaps (weekends/sessions) simply yield fewer bars.
 */
export function replayRange(
  startTimeSeconds: number,
  intervalSeconds: number,
  opts: { lookbackBars?: number; forwardBars?: number } = {}
): DatasetLoadRange {
  const start = Math.floor(Number(startTimeSeconds))
  const interval = positiveInt(intervalSeconds, 60)
  const lookback = Math.max(0, Math.floor(opts.lookbackBars ?? IMPORT_REPLAY_LOOKBACK_BARS))
  const forward = positiveInt(opts.forwardBars ?? IMPORT_REPLAY_FORWARD_BARS, 1)

  return {
    startTime: Math.max(0, (Number.isFinite(start) ? start : 0) - lookback * interval),
    limit: lookback + forward
  }
}

/** Coverage after joining a newly loaded page onto an existing window. */
export function mergeLoadedWindow(
  prev: DatasetLoadedWindow | null,
  next: DatasetLoadedWindow
): DatasetLoadedWindow {
  if (!prev || prev.loadedFrom === 0 || prev.loadedTo === 0) return next
  if (next.loadedFrom === 0 || next.loadedTo === 0) return prev

  const olderIsNext = next.loadedFrom < prev.loadedFrom
  const newerIsNext = next.loadedTo > prev.loadedTo

  return {
    loadedFrom: Math.min(prev.loadedFrom, next.loadedFrom),
    loadedTo: Math.max(prev.loadedTo, next.loadedTo),
    hasMoreBefore: olderIsNext ? next.hasMoreBefore : prev.hasMoreBefore,
    hasMoreAfter: newerIsNext ? next.hasMoreAfter : prev.hasMoreAfter,
    totalCount: next.totalCount || prev.totalCount
  }
}
