import { describe, expect, it, vi } from 'vitest'
import type { Candle } from '@shared/candleUtils'
import { DataSourceError } from '@shared/datasource/errors'
import type { KlinesFetchParams, KlinesFetchResult } from '@shared/klinesTypes'
import { BinanceFeed, type KlinesTransport } from './binanceFeed'

function candles(startTimes: number[]): Candle[] {
  return startTimes.map((time) => ({ time, open: 1, high: 2, low: 0.5, close: 1.5 }))
}

function ok(result: Candle[]): KlinesFetchResult {
  return { ok: true, candles: result }
}

function fail(status: number, error: string, detail?: string): KlinesFetchResult {
  return { ok: false, status, error, ...(detail ? { detail } : {}) }
}

function transportOf(responses: ((params: KlinesFetchParams) => KlinesFetchResult)[]) {
  const transport = vi.fn((params: KlinesFetchParams): Promise<KlinesFetchResult> =>
    Promise.resolve(
      responses[Math.min(transport.mock.calls.length - 1, responses.length - 1)]?.(params) ?? ok([])
    )
  )
  return transport as unknown as KlinesTransport & { mock: { calls: KlinesFetchParams[][] } }
}

describe('BinanceFeed.getPage', () => {
  it('uppercases the symbol and converts second bounds to milliseconds', async () => {
    const transport = transportOf([() => ok(candles([60]))])
    const feed = new BinanceFeed(transport)

    await feed.getPage({
      symbol: 'btcusdt',
      timeframe: '1m',
      startTime: 100,
      endTime: 200,
      limit: 250
    })

    expect(transport.mock.calls[0][0]).toEqual({
      symbol: 'BTCUSDT',
      interval: '1m',
      limit: 250,
      startTime: 100_000,
      endTime: 200_000
    })
  })

  it('falls back to the default page limit and omits unset bounds', async () => {
    const transport = transportOf([() => ok([])])
    const feed = new BinanceFeed(transport)

    await feed.getPage({ symbol: 'ETHUSDT', timeframe: '5m' })

    expect(transport.mock.calls[0][0]).toEqual({
      symbol: 'ETHUSDT',
      interval: '5m',
      limit: 1000
    })
  })

  it('returns an empty array when the result carries no candle list', async () => {
    const transport = transportOf([() => ({ ok: true }) as unknown as KlinesFetchResult])
    const feed = new BinanceFeed(transport)
    await expect(feed.getPage({ symbol: 'X', timeframe: '1m' })).resolves.toEqual([])
  })

  it('maps upstream status to a typed DataSourceError', async () => {
    const transport = transportOf([() => fail(429, 'rate limited', 'weight')])

    const error = await new BinanceFeed(transport)
      .getPage({ symbol: 'X', timeframe: '1m' })
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(DataSourceError)
    expect((error as DataSourceError).kind).toBe('rate-limit')
    expect((error as DataSourceError).message).toBe('rate limited')
    expect((error as DataSourceError).detail).toBe('weight')
  })

  it('maps client errors to invalid-input', async () => {
    const transport = transportOf([() => fail(400, 'bad request')])
    const feed = new BinanceFeed(transport)

    const error = await feed.getPage({ symbol: 'X', timeframe: '1m' }).catch((err) => err)
    expect((error as DataSourceError).kind).toBe('invalid-input')
  })

  it('wraps transport rejections', async () => {
    const transport = vi.fn(() =>
      Promise.reject(new Error('offline'))
    ) as unknown as KlinesTransport
    const feed = new BinanceFeed(transport)

    const error = await feed.getPage({ symbol: 'X', timeframe: '1m' }).catch((err) => err)
    expect(error).toBeInstanceOf(DataSourceError)
    expect((error as DataSourceError).message).toBe('offline')
  })
})

describe('BinanceFeed.getHistory', () => {
  it('paginates backwards in milliseconds until a short page', async () => {
    const transport = transportOf([
      () => ok(candles([120, 180])),
      (params) => (params.endTime === 119_000 ? ok(candles([60])) : ok([]))
    ])
    const feed = new BinanceFeed(transport)

    const result = await feed.getHistory(
      { symbol: 'BTCUSDT', timeframe: '1m', limit: 2 },
      { pages: 3 }
    )

    expect(result.map((c) => c.time)).toEqual([60, 120, 180])
    expect(transport.mock.calls[1][0].endTime).toBe(119_000)
  })
})

describe('BinanceFeed.getRange', () => {
  it('pages forward inside the requested window', async () => {
    const transport = transportOf([
      (params) => ok(params.startTime === 100_000 ? candles([100, 160]) : candles([220]))
    ])
    const feed = new BinanceFeed(transport)

    const result = await feed.getRange(
      { symbol: 'BTCUSDT', timeframe: '1m', limit: 2 },
      { startTimeSeconds: 100, endTimeSeconds: 300 }
    )

    expect(result.map((c) => c.time)).toEqual([100, 160, 220])
    expect(transport.mock.calls[1][0].startTime).toBe(161_000)
  })

  it('returns empty for an inverted range without calling the transport', async () => {
    const transport = transportOf([])
    const feed = new BinanceFeed(transport)

    const result = await feed.getRange(
      { symbol: 'BTCUSDT', timeframe: '1m' },
      { startTimeSeconds: 10, endTimeSeconds: 5 }
    )

    expect(result).toEqual([])
    expect(transport).not.toHaveBeenCalled()
  })
})
