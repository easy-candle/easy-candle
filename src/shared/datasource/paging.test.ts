import { describe, expect, it, vi } from 'vitest'
import type { Candle } from '../candleUtils'
import type { CandleFeed, FeedCapabilities, FeedPageQuery } from './types'
import { pageBackwards, pageRange } from './paging'

const capabilities: FeedCapabilities = { live: false, boundedHistory: false, rangeQuery: true }

function candles(startTimes: number[]): Candle[] {
  return startTimes.map((time) => ({ time, open: 1, high: 2, low: 0.5, close: 1.5 }))
}

type FakePage = (query: FeedPageQuery, call: number) => Candle[]

function fakeFeed(onPage: FakePage) {
  const getPage = vi.fn(async (query: FeedPageQuery): Promise<Candle[]> =>
    onPage(query, getPage.mock.calls.length)
  )
  const feed: CandleFeed = {
    ref: { kind: 'binance' },
    capabilities,
    getPage
  }
  return { feed, getPage }
}

describe('pageBackwards', () => {
  it('stitches pages into one ascending series', async () => {
    const pages = [candles([900, 960]), candles([780, 840]), candles([660, 720])]
    const { feed, getPage } = fakeFeed((_q, call) => pages[call - 1] ?? [])

    const result = await pageBackwards(
      feed,
      { symbol: 'BTCUSDT', timeframe: '1m', limit: 2 },
      {
        pages: 3,
        endTimeSeconds: 1000
      }
    )

    expect(result.map((c) => c.time)).toEqual([660, 720, 780, 840, 900, 960])
    expect(getPage).toHaveBeenCalledTimes(3)
    expect(getPage.mock.calls[0][0].endTime).toBe(1000)
    expect(getPage.mock.calls[0][0].startTime).toBeUndefined()
  })

  it('advances endTime to one second before the earliest candle of each page', async () => {
    const pages = [candles([900, 960]), candles([700, 720])]
    const { feed, getPage } = fakeFeed((_q, call) => pages[call - 1] ?? [])

    await pageBackwards(feed, { symbol: 'BTCUSDT', timeframe: '1m' }, { pages: 2 })

    expect(getPage.mock.calls[1][0].endTime).toBe(899)
  })

  it('omits endTime on the first page so the newest bars are returned', async () => {
    const { feed, getPage } = fakeFeed(() => [])
    await pageBackwards(feed, { symbol: 'BTCUSDT', timeframe: '1m' }, { pages: 1 })
    expect(getPage.mock.calls[0][0]).not.toHaveProperty('endTime')
  })

  it('stops when a page comes back short of the requested limit', async () => {
    const { feed, getPage } = fakeFeed(() => candles([500]))
    const result = await pageBackwards(
      feed,
      { symbol: 'BTCUSDT', timeframe: '1m', limit: 2 },
      { pages: 5 }
    )
    expect(result.map((c) => c.time)).toEqual([500])
    expect(getPage).toHaveBeenCalledTimes(1)
  })

  it('stops on an empty page without failing', async () => {
    const { feed, getPage } = fakeFeed(() => [])
    const result = await pageBackwards(
      feed,
      { symbol: 'BTCUSDT', timeframe: '1m', limit: 2 },
      { pages: 4 }
    )
    expect(result).toEqual([])
    expect(getPage).toHaveBeenCalledTimes(1)
  })

  it('dedupes overlapping candles across page seams', async () => {
    const pages = [candles([900, 960, 1020]), candles([840, 900])]
    const { feed } = fakeFeed((_q, call) => pages[call - 1] ?? [])
    const result = await pageBackwards(
      feed,
      { symbol: 'BTCUSDT', timeframe: '1m', limit: 3 },
      { pages: 2 }
    )
    expect(result.map((c) => c.time)).toEqual([840, 900, 960, 1020])
  })
})

describe('pageRange', () => {
  it('returns empty for an invalid or inverted range', async () => {
    const { feed, getPage } = fakeFeed(() => [])
    expect(
      await pageRange(
        feed,
        { symbol: 'X', timeframe: '1m' },
        { startTimeSeconds: 10, endTimeSeconds: 10, maxPages: 3 }
      )
    ).toEqual([])
    expect(
      await pageRange(
        feed,
        { symbol: 'X', timeframe: '1m' },
        { startTimeSeconds: Number.NaN, endTimeSeconds: 20, maxPages: 3 }
      )
    ).toEqual([])
    expect(getPage).not.toHaveBeenCalled()
  })

  it('walks forward until the range is covered', async () => {
    const { feed, getPage } = fakeFeed((q) => {
      if (q.startTime === 100) return candles([100, 160])
      return candles([220, 280])
    })

    const result = await pageRange(
      feed,
      { symbol: 'ETHUSDT', timeframe: '1m', limit: 2 },
      { startTimeSeconds: 100, endTimeSeconds: 300, maxPages: 4 }
    )

    expect(result.map((c) => c.time)).toEqual([100, 160, 220, 280])
    expect(getPage.mock.calls[1][0].startTime).toBe(161)
    expect(getPage.mock.calls[1][0].endTime).toBe(300)
  })

  it('stops once the last candle reaches the end bound', async () => {
    const { feed, getPage } = fakeFeed(() => candles([100, 299]))
    const result = await pageRange(
      feed,
      { symbol: 'X', timeframe: '1m' },
      { startTimeSeconds: 100, endTimeSeconds: 300, maxPages: 5 }
    )
    expect(result.map((c) => c.time)).toEqual([100, 299])
    expect(getPage).toHaveBeenCalledTimes(1)
  })
})
