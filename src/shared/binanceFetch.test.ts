import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BINANCE_API_BASE,
  BINANCE_VISION_API_BASE,
  BinanceUpstreamError,
  buildKlinesUrl,
  fetchBinanceKlines
} from './binanceFetch'

const SAMPLE_KLINE = [
  1_700_000_000_000,
  '100',
  '110',
  '90',
  '105',
  '1.5',
  1_700_000_059_999
]

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('buildKlinesUrl', () => {
  it('defaults to api.binance.com', () => {
    const url = buildKlinesUrl({ symbol: 'btcusdt', interval: '1m', limit: 500 })
    expect(url).toBe(`${BINANCE_API_BASE}/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500`)
  })

  it('builds the vision market-data mirror URL', () => {
    const url = buildKlinesUrl(
      { symbol: 'ETHUSDT', interval: '15m', startTime: 1, endTime: 2, limit: 100 },
      BINANCE_VISION_API_BASE
    )
    expect(url).toBe(
      `${BINANCE_VISION_API_BASE}/api/v3/klines?symbol=ETHUSDT&interval=15m&limit=100&startTime=1&endTime=2`
    )
  })
})

describe('fetchBinanceKlines', () => {
  it('returns candles from the primary Binance API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([SAMPLE_KLINE]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchBinanceKlines({ symbol: 'BTCUSDT', interval: '1m', limit: 1 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain(BINANCE_API_BASE)
    expect(result.upstreamStatus).toBe(200)
    expect(result.candles).toEqual([
      { time: 1_700_000_000, open: 100, high: 110, low: 90, close: 105, volume: 1.5 }
    ])
  })

  it('falls back to data-api.binance.vision when the primary API returns an error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ msg: 'restricted location' }, 451))
      .mockResolvedValueOnce(jsonResponse([SAMPLE_KLINE]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchBinanceKlines({ symbol: 'BTCUSDT', interval: '1m', limit: 1 })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain(BINANCE_API_BASE)
    expect(String(fetchMock.mock.calls[1][0])).toContain(BINANCE_VISION_API_BASE)
    expect(result.candles).toHaveLength(1)
    expect(result.candles[0].close).toBe(105)
  })

  it('falls back to the vision mirror when the primary API is unreachable', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse([SAMPLE_KLINE]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchBinanceKlines({ symbol: 'ETHUSDT', interval: '5m' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain(BINANCE_VISION_API_BASE)
    expect(result.upstreamStatus).toBe(200)
    expect(result.candles[0].time).toBe(1_700_000_000)
  })

  it('throws the vision error when both hosts fail', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse('blocked', 403))
      .mockResolvedValueOnce(jsonResponse('blocked', 403))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchBinanceKlines({ symbol: 'BTCUSDT', interval: '1m' })).rejects.toMatchObject({
      name: 'BinanceUpstreamError',
      status: 403
    } satisfies Partial<BinanceUpstreamError>)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
