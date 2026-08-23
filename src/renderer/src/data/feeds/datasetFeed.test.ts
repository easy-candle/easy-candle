import { describe, expect, it, vi } from 'vitest'
import type { Candle } from '@shared/candleUtils'
import { DataSourceError } from '@shared/datasource/errors'
import type { ImportLoadRange, ImportLoadResult } from '@shared/importTypes'
import { DatasetFeed, type ImportLoadTransport } from './datasetFeed'

function candles(startTimes: number[]): Candle[] {
  return startTimes.map((time) => ({ time, open: 1, high: 2, low: 0.5, close: 1.5 }))
}

const meta = {
  id: 'ds-1',
  symbol: 'BTCUSDT',
  sourceTimeframe: '1m',
  timeframe: '5m',
  originalFileName: 'btc.csv',
  candleCount: 3,
  firstTime: 100,
  lastTime: 300,
  timeframes: {
    '5m': { candleCount: 3, firstTime: 100, lastTime: 300 }
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

function ok(candlesList: Candle[], withWindow = true): ImportLoadResult {
  return {
    ok: true,
    meta,
    candles: candlesList,
    ...(withWindow
      ? {
          window: {
            loadedFrom: 100,
            loadedTo: 300,
            hasMoreBefore: false,
            hasMoreAfter: false,
            totalCount: 3
          }
        }
      : {})
  }
}

function transportOf(
  respond: (id: string, timeframe?: string, range?: ImportLoadRange) => ImportLoadResult
) {
  return vi.fn(
    async (id: string, timeframe?: string, range?: ImportLoadRange): Promise<ImportLoadResult> =>
      respond(id, timeframe, range)
  ) as unknown as ImportLoadTransport & {
    mock: { calls: [string, string | undefined, ImportLoadRange | undefined][] }
  }
}

describe('DatasetFeed.getPage', () => {
  it('passes id, timeframe, and second bounds through unchanged', async () => {
    const transport = transportOf(() => ok(candles([100])))
    const feed = new DatasetFeed({ id: 'ds-1', transport })

    await feed.getPage({
      symbol: 'BTCUSDT',
      timeframe: '5m',
      startTime: 100,
      endTime: 300,
      limit: 50
    })

    expect(transport.mock.calls[0]).toEqual([
      'ds-1',
      '5m',
      { startTime: 100, endTime: 300, limit: 50 }
    ])
  })

  it('omits unset bounds and floors fractional seconds', async () => {
    const transport = transportOf(() => ok([]))
    const feed = new DatasetFeed({ id: 'ds-1', transport })

    await feed.getPage({ symbol: 'BTCUSDT', timeframe: '5m', startTime: 99.9 })

    expect(transport.mock.calls[0][2]).toEqual({ startTime: 99 })
  })

  it('exposes meta and window after a successful load', async () => {
    const transport = transportOf(() => ok(candles([100, 200, 300])))
    const feed = new DatasetFeed({ id: 'ds-1', transport })

    expect(feed.getMeta()).toBeNull()
    expect(feed.getWindow()).toBeNull()

    const result = await feed.getPage({ symbol: 'BTCUSDT', timeframe: '5m' })

    expect(result.map((c) => c.time)).toEqual([100, 200, 300])
    expect(feed.getMeta()?.id).toBe('ds-1')
    expect(feed.getWindow()?.totalCount).toBe(3)
  })

  it('keeps window null when the host omits it', async () => {
    const transport = transportOf(() => ok(candles([100]), false))
    const feed = new DatasetFeed({ id: 'ds-1', transport })

    await feed.getPage({ symbol: 'BTCUSDT', timeframe: '5m' })

    expect(feed.getWindow()).toBeNull()
  })

  it('maps missing datasets to not-found', async () => {
    const transport = transportOf(() => ({ ok: false, error: 'Saved import not found.' }))
    const feed = new DatasetFeed({ id: 'gone', transport })

    const error = await feed
      .getPage({ symbol: 'BTCUSDT', timeframe: '5m' })
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(DataSourceError)
    expect((error as DataSourceError).kind).toBe('not-found')
  })

  it('maps missing timeframe series to not-found', async () => {
    const transport = transportOf(() => ({
      ok: false,
      error: 'No candles found for timeframe 15m.'
    }))
    const feed = new DatasetFeed({ id: 'ds-1', transport })

    const error = await feed
      .getPage({ symbol: 'BTCUSDT', timeframe: '15m' })
      .catch((err: unknown) => err)

    expect((error as DataSourceError).kind).toBe('not-found')
  })

  it('maps other failures to unknown with the host message', async () => {
    const transport = transportOf(() => ({ ok: false, error: 'Disk on fire' }))
    const feed = new DatasetFeed({ id: 'ds-1', transport })

    const error = await feed
      .getPage({ symbol: 'BTCUSDT', timeframe: '5m' })
      .catch((err: unknown) => err)

    expect((error as DataSourceError).kind).toBe('unknown')
    expect((error as DataSourceError).message).toBe('Disk on fire')
  })

  it('wraps transport rejections', async () => {
    const transport = vi.fn(() =>
      Promise.reject(new Error('channel closed'))
    ) as unknown as ImportLoadTransport
    const feed = new DatasetFeed({ id: 'ds-1', transport })

    const error = await feed
      .getPage({ symbol: 'BTCUSDT', timeframe: '5m' })
      .catch((err: unknown) => err)

    expect(error).toBeInstanceOf(DataSourceError)
    expect((error as DataSourceError).message).toBe('channel closed')
  })
})
