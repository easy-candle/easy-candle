import { BinanceUpstreamError, fetchBinanceKlines } from './binanceFetch'
import { clampKlineLimit } from './candleUtils'
import type { KlinesFetchParams, KlinesFetchResult } from './klinesTypes'
import { isAllowedSymbol } from './symbols'
import { isAllowedInterval } from './timeframes'

function parseOptionalMs(value: unknown, name: string): { value?: number; error?: string } {
  if (value == null || value === '') return {}
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    return { error: `Invalid ${name}` }
  }
  return { value: Math.floor(n) }
}

function upstreamFailure(err: unknown): KlinesFetchResult {
  const message = err instanceof Error ? err.message : 'Upstream request failed'
  const upstreamStatus =
    err instanceof BinanceUpstreamError
      ? err.status
      : err && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: number }).status)
        : undefined

  let clientMessage = 'Failed to fetch klines from Binance'
  let status = 502

  if (upstreamStatus === 429) {
    clientMessage = 'Binance rate limit reached — try again shortly'
    status = 429
  } else if (upstreamStatus === 418) {
    clientMessage = 'Binance temporarily blocked this IP — try again later'
    status = 503
  } else if (upstreamStatus != null && upstreamStatus >= 400 && upstreamStatus < 500) {
    clientMessage = 'Binance rejected the klines request'
    status = 502
  }

  return {
    ok: false,
    status,
    error: clientMessage,
    detail: message,
    ...(Number.isFinite(upstreamStatus) ? { upstreamStatus } : {})
  }
}

/**
 * Validate a klines request and fetch it, returning a normalized result object
 * instead of throwing. Shared by the desktop IPC handler and the web transport.
 */
export async function fetchKlinesResult(params: KlinesFetchParams): Promise<KlinesFetchResult> {
  const symbol = String(params?.symbol || '').toUpperCase()
  const interval = String(params?.interval || '')

  if (!symbol || !isAllowedSymbol(symbol)) {
    return { ok: false, status: 400, error: 'Invalid or unsupported symbol' }
  }

  if (!interval || !isAllowedInterval(interval)) {
    return { ok: false, status: 400, error: 'Invalid or unsupported interval' }
  }

  const startParsed = parseOptionalMs(params.startTime, 'startTime')
  if (startParsed.error) {
    return { ok: false, status: 400, error: startParsed.error }
  }

  const endParsed = parseOptionalMs(params.endTime, 'endTime')
  if (endParsed.error) {
    return { ok: false, status: 400, error: endParsed.error }
  }

  const startTime = startParsed.value
  const endTime = endParsed.value

  if (startTime != null && endTime != null && startTime >= endTime) {
    return { ok: false, status: 400, error: 'startTime must be less than endTime' }
  }

  const limit = clampKlineLimit(params.limit, 500)

  try {
    const { candles } = await fetchBinanceKlines({
      symbol,
      interval,
      startTime,
      endTime,
      limit
    })

    return { ok: true, candles }
  } catch (err) {
    return upstreamFailure(err)
  }
}
