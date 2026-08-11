import type { Candle } from './candleUtils'
import { TIMEFRAMES } from './timeframes'

/** Timeframes derived from an imported 1m series (excludes source 1m). */
export const IMPORT_DERIVED_TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'] as const

/** All timeframes stored for an imported symbol. */
export const IMPORT_STORED_TIMEFRAMES = ['1m', ...IMPORT_DERIVED_TIMEFRAMES] as const

export type ImportStoredTimeframe = (typeof IMPORT_STORED_TIMEFRAMES)[number]

/**
 * Aggregate lower-timeframe candles into a higher interval.
 * Open time is floored to `intervalSeconds` (UTC). Incomplete final buckets are kept.
 */
export function aggregateCandles(candles: Candle[], intervalSeconds: number): Candle[] {
  const step = Math.max(1, Math.floor(intervalSeconds) || 1)
  if (!Array.isArray(candles) || candles.length === 0) return []

  const out: Candle[] = []
  let bucketOpen = Number.NaN
  let open = 0
  let high = 0
  let low = 0
  let close = 0
  let volume = 0
  let hasVolume = false

  function flush(): void {
    if (!Number.isFinite(bucketOpen)) return
    const candle: Candle = { time: bucketOpen, open, high, low, close }
    if (hasVolume) candle.volume = volume
    out.push(candle)
  }

  for (const candle of candles) {
    const t = Math.floor(Number(candle.time))
    if (!Number.isFinite(t)) continue
    const openTime = Math.floor(t / step) * step

    if (openTime !== bucketOpen) {
      flush()
      bucketOpen = openTime
      open = candle.open
      high = candle.high
      low = candle.low
      close = candle.close
      volume = candle.volume ?? 0
      hasVolume = candle.volume != null
      continue
    }

    high = Math.max(high, candle.high)
    low = Math.min(low, candle.low)
    close = candle.close
    if (candle.volume != null) {
      volume += candle.volume
      hasVolume = true
    }
  }

  flush()
  return out
}

/** Build 1m + derived TF maps from a validated 1-minute series. */
export function buildImportTimeframes(candles1m: Candle[]): Record<string, Candle[]> {
  const result: Record<string, Candle[]> = {
    '1m': candles1m
  }

  for (const id of IMPORT_DERIVED_TIMEFRAMES) {
    const tf = TIMEFRAMES[id]
    if (!tf) continue
    result[id] = aggregateCandles(candles1m, tf.seconds)
  }

  return result
}
