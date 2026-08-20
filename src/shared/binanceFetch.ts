import {
  clampKlineLimit,
  dedupeCandlesByTime,
  mapBinanceKlines,
  type Candle
} from '@shared/candleUtils'

export const BINANCE_API_BASE = 'https://api.binance.com'
/** Public market-data mirror used when `api.binance.com` is geo-blocked or otherwise unreachable. */
export const BINANCE_VISION_API_BASE = 'https://data-api.binance.vision'
export const BINANCE_KLINES_PATH = '/api/v3/klines'

export const BINANCE_KLINES_BASES = [BINANCE_API_BASE, BINANCE_VISION_API_BASE] as const

export type BinanceKlinesParams = {
  symbol: string
  interval: string
  startTime?: number
  endTime?: number
  limit?: number
}

export class BinanceUpstreamError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'BinanceUpstreamError'
    this.status = status
  }
}

/** Build a Binance klines URL from allowlisted params. */
export function buildKlinesUrl(
  params: BinanceKlinesParams,
  base: string = BINANCE_API_BASE
): string {
  const url = new URL(BINANCE_KLINES_PATH, base)
  url.searchParams.set('symbol', params.symbol.toUpperCase())
  url.searchParams.set('interval', params.interval)

  if (params.limit != null) {
    url.searchParams.set('limit', String(params.limit))
  }
  if (params.startTime != null) {
    url.searchParams.set('startTime', String(params.startTime))
  }
  if (params.endTime != null) {
    url.searchParams.set('endTime', String(params.endTime))
  }

  return url.toString()
}

/** True when the requested range is entirely in the past (safe to cache hard). */
export function isHistoricalRange(endTimeMs: number | undefined): boolean {
  if (endTimeMs == null || !Number.isFinite(endTimeMs)) return false
  return endTimeMs < Date.now() - 60_000
}

async function fetchKlinesFromUrl(
  url: string
): Promise<{ candles: Candle[]; upstreamStatus: number }> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json'
    }
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new BinanceUpstreamError(
      detail
        ? `Binance klines failed (${response.status}): ${detail.slice(0, 200)}`
        : `Binance klines failed (${response.status})`,
      response.status
    )
  }

  const rows = await response.json()
  const candles = dedupeCandlesByTime(mapBinanceKlines(rows))

  return {
    candles,
    upstreamStatus: response.status
  }
}

/**
 * Fetch Binance klines and normalize to chart candles (`time` in seconds).
 * Tries `api.binance.com` first, then `data-api.binance.vision` on failure.
 */
export async function fetchBinanceKlines(
  params: BinanceKlinesParams
): Promise<{ candles: Candle[]; upstreamStatus: number }> {
  const limited: BinanceKlinesParams = {
    ...params,
    limit: clampKlineLimit(params.limit, 500)
  }

  let lastError: unknown

  for (const base of BINANCE_KLINES_BASES) {
    try {
      return await fetchKlinesFromUrl(buildKlinesUrl(limited, base))
    } catch (err) {
      lastError = err
    }
  }

  throw lastError
}
