import { clampKlineLimit, dedupeCandlesByTime, type Candle } from '@shared/candleUtils'
import type { KlinesFetchParams } from '@shared/klinesTypes'

/** Default pages (×1000) for the live chart history window. */
export const DEFAULT_HISTORY_PAGES = 2

/** Candles before the replay start (context left of the playhead). */
export const REPLAY_LOOKBACK_BARS = 200

/** Candles after the replay start loaded up front. */
export const REPLAY_FORWARD_BARS = 500

/** Batch size when extending the buffer during play. */
export const PREFETCH_BATCH_SIZE = 500

/** Max forward pages when filling a replay/jump window. */
const MAX_RANGE_PAGES = 8

/** Max bars a single `fetchCandlesRange` call can return. */
export const MAX_RANGE_BARS = MAX_RANGE_PAGES * 1000

/** Client-side: fetch one page via Electron main-process IPC. */
export async function fetchCandlesPage(params: {
  symbol: string
  interval: string
  startTime?: number
  endTime?: number
  limit?: number
}): Promise<Candle[]> {
  const limit = clampKlineLimit(params.limit, 1000)
  const request: KlinesFetchParams = {
    symbol: params.symbol.toUpperCase(),
    interval: params.interval,
    limit
  }

  if (params.startTime != null) {
    request.startTime = params.startTime
  }
  if (params.endTime != null) {
    request.endTime = params.endTime
  }

  const result = await window.api.fetchKlines(request)

  if (!result.ok) {
    if (result.status === 429 || result.status === 503) {
      throw new Error(result.error || 'Binance temporarily unavailable. Try again shortly.')
    }

    const detail = result.detail ? ` — ${result.detail}` : ''
    throw new Error((result.error || `Failed to load candles (${result.status})`) + detail)
  }

  return Array.isArray(result.candles) ? result.candles : []
}

/** Client-side: paginate backwards from `endTime` (default: now) for a history window. */
export async function fetchCandles(params: {
  symbol: string
  interval: string
  pages?: number
  limit?: number
  endTime?: number
}): Promise<Candle[]> {
  const pages = Math.max(1, Math.min(5, params.pages ?? DEFAULT_HISTORY_PAGES))
  const limit = clampKlineLimit(params.limit, 1000)
  let endTime = params.endTime ?? Date.now()

  const batches: Candle[][] = []

  for (let page = 0; page < pages; page += 1) {
    const batch = await fetchCandlesPage({
      symbol: params.symbol,
      interval: params.interval,
      endTime,
      limit
    })

    if (batch.length === 0) break

    batches.push(batch)

    const earliestMs = batch[0].time * 1000
    endTime = earliestMs - 1

    if (batch.length < limit) break
  }

  batches.reverse()
  return dedupeCandlesByTime(batches.flat())
}

/** Client-side: fetch candles covering `[startTime, endTime]` (Unix ms), paging forward. */
export async function fetchCandlesRange(params: {
  symbol: string
  interval: string
  startTime: number
  endTime: number
  limit?: number
}): Promise<Candle[]> {
  const limit = clampKlineLimit(params.limit, 1000)
  const endTime = Math.floor(params.endTime)
  let cursor = Math.floor(params.startTime)

  if (!Number.isFinite(cursor) || !Number.isFinite(endTime) || cursor >= endTime) {
    return []
  }

  const batches: Candle[][] = []

  for (let page = 0; page < MAX_RANGE_PAGES; page += 1) {
    const batch = await fetchCandlesPage({
      symbol: params.symbol,
      interval: params.interval,
      startTime: cursor,
      endTime,
      limit
    })

    if (batch.length === 0) break

    batches.push(batch)

    const last = batch[batch.length - 1]
    const lastOpenMs = last.time * 1000

    if (lastOpenMs >= endTime - 1 || batch.length < limit) break

    cursor = lastOpenMs + 1
    if (cursor >= endTime) break
  }

  return dedupeCandlesByTime(batches.flat())
}

/** Client-side: fetch the next batch after `afterTimeSeconds` (candle open, UTC seconds). */
export async function prefetchForward(params: {
  symbol: string
  interval: string
  afterTimeSeconds: number
  limit?: number
}): Promise<Candle[]> {
  const after = Number(params.afterTimeSeconds)
  if (!Number.isFinite(after)) return []

  const limit = clampKlineLimit(params.limit, PREFETCH_BATCH_SIZE)

  return fetchCandlesPage({
    symbol: params.symbol,
    interval: params.interval,
    startTime: Math.floor(after * 1000) + 1,
    limit
  })
}

/** Build a lookback + forward window (ms) around a UTC start time in seconds. */
export function buildReplayWindowMs(opts: {
  startTimeSeconds: number
  intervalSeconds: number
  lookbackBars?: number
  forwardBars?: number
}): { startTimeMs: number; endTimeMs: number } {
  const intervalSeconds = Math.max(1, opts.intervalSeconds)
  const lookback = opts.lookbackBars ?? REPLAY_LOOKBACK_BARS
  const forward = opts.forwardBars ?? REPLAY_FORWARD_BARS
  const startSec = Math.floor(opts.startTimeSeconds)

  const startTimeMs = Math.max(0, (startSec - lookback * intervalSeconds) * 1000)
  const endTimeMs = Math.min(Date.now(), (startSec + forward * intervalSeconds) * 1000)

  return { startTimeMs, endTimeMs }
}
