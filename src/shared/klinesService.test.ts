import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchKlinesResult } from './klinesService'

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body
  } as Response
}

const klineRow = [1_700_000_000_000, '100', '110', '90', '105', '1.5']

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchKlinesResult validation', () => {
  it.each([
    [{ symbol: 'BAD!', interval: '1m' }, 'Invalid or unsupported symbol'],
    [{ symbol: 'BTCUSDT', interval: '2h' }, 'Invalid or unsupported interval'],
    [{ symbol: 'BTCUSDT', interval: '1m', startTime: -5 }, 'Invalid startTime'],
    [{ symbol: 'BTCUSDT', interval: '1m', endTime: 'x' }, 'Invalid endTime'],
    [
      { symbol: 'BTCUSDT', interval: '1m', startTime: 200, endTime: 100 },
      'startTime must be less than endTime'
    ]
  ])('rejects %j without touching the network', async (params, error) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchKlinesResult(params as never)

    expect(result).toEqual({ ok: false, status: 400, error })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('fetchKlinesResult upstream mapping', () => {
  it('normalizes rows into candles on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, [klineRow]))
    )

    const result = await fetchKlinesResult({ symbol: 'btcusdt', interval: '1m', limit: 10 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.candles).toEqual([
        { time: 1_700_000_000, open: 100, high: 110, low: 90, close: 105, volume: 1.5 }
      ])
    }
  })

  it('maps a 429 upstream to the rate-limit result after exhausting mirrors', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(429, 'too many'))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchKlinesResult({ symbol: 'BTCUSDT', interval: '1m' })

    expect(result).toMatchObject({
      ok: false,
      status: 429,
      error: 'Binance rate limit reached — try again shortly',
      upstreamStatus: 429
    })
    expect(result.ok === false && result.detail?.includes('429')).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('maps unexpected network failures to a 502 result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )

    const result = await fetchKlinesResult({ symbol: 'BTCUSDT', interval: '1m' })

    expect(result).toMatchObject({ ok: false, status: 502, detail: 'offline' })
  })
})
