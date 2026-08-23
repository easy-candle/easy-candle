import { dedupeCandlesByTime, type Candle } from '../candleUtils'
import type { CandleFeed, FeedPageQuery } from './types'

export type FeedPageBase = Pick<FeedPageQuery, 'symbol' | 'timeframe'> & { limit?: number }

function pageCount(pages: number, maxPages?: number): number {
  const cap = maxPages ?? pages
  return Math.max(1, Math.min(cap, pages))
}

/**
 * Walk a feed backwards from `endTimeSeconds` (or the newest bars when omitted),
 * stitching pages into one ascending series. Stops early on an empty page or a
 * page shorter than `limit` (upstream exhausted).
 */
export async function pageBackwards(
  feed: CandleFeed,
  base: FeedPageBase,
  opts: { pages: number; maxPages?: number; endTimeSeconds?: number }
): Promise<Candle[]> {
  let endTime = opts.endTimeSeconds
  const batches: Candle[][] = []

  for (let page = 0; page < pageCount(opts.pages, opts.maxPages); page += 1) {
    const batch = await feed.getPage({
      ...base,
      ...(endTime != null ? { endTime } : {})
    })
    if (batch.length === 0) break

    batches.push(batch)
    endTime = batch[0].time - 1
    if (base.limit != null && batch.length < base.limit) break
  }

  batches.reverse()
  return dedupeCandlesByTime(batches.flat())
}

/** Fetch candles covering `[startTimeSeconds, endTimeSeconds]`, paging forward. */
export async function pageRange(
  feed: CandleFeed,
  base: FeedPageBase,
  opts: { startTimeSeconds: number; endTimeSeconds: number; maxPages: number }
): Promise<Candle[]> {
  const endTime = Math.floor(opts.endTimeSeconds)
  let cursor = Math.floor(opts.startTimeSeconds)

  if (!Number.isFinite(cursor) || !Number.isFinite(endTime) || cursor >= endTime) return []

  const batches: Candle[][] = []

  for (let page = 0; page < Math.max(1, opts.maxPages); page += 1) {
    const batch = await feed.getPage({ ...base, startTime: cursor, endTime })
    if (batch.length === 0) break

    batches.push(batch)

    const lastOpen = batch[batch.length - 1].time
    if (lastOpen >= endTime - 1) break
    if (base.limit != null && batch.length < base.limit) break
    cursor = lastOpen + 1
    if (cursor >= endTime) break
  }

  return dedupeCandlesByTime(batches.flat())
}
