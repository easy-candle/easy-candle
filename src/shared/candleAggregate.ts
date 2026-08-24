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

/**
 * Live-style HTF candle for the bucket that contains the last finer bar:
 * open from the first included finer bar, running high/low, close from the
 * latest finer bar. Does not use later finer bars (no lookahead).
 */
export function formingHigherTfCandle(
  finerCandles: Candle[],
  coarserIntervalSeconds: number
): Candle | null {
  if (!Array.isArray(finerCandles) || finerCandles.length === 0) return null
  const step = Math.max(1, Math.floor(Number(coarserIntervalSeconds)) || 1)
  const last = finerCandles[finerCandles.length - 1]
  const lastTime = Math.floor(Number(last?.time))
  if (!Number.isFinite(lastTime)) return null
  const bucketOpen = Math.floor(lastTime / step) * step

  const bucket: Candle[] = []
  for (let i = finerCandles.length - 1; i >= 0; i -= 1) {
    const candle = finerCandles[i]
    const t = Math.floor(Number(candle.time))
    if (!Number.isFinite(t) || t < bucketOpen) break
    bucket.push(candle)
  }
  bucket.reverse()
  return aggregateCandles(bucket, step)[0] ?? null
}

function sameOhlc(a: Candle, b: Candle): boolean {
  return (
    a.time === b.time &&
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.volume === b.volume
  )
}

/**
 * Replace the current coarser bar with a forming candle built from finer
 * bars played so far. Earlier coarser bars stay completed.
 */
export function overlayFormingHigherTf(
  coarserCandles: Candle[],
  finerCandles: Candle[],
  coarserIntervalSeconds: number
): Candle[] {
  const series = Array.isArray(coarserCandles) ? coarserCandles : []
  const forming = formingHigherTfCandle(finerCandles, coarserIntervalSeconds)
  if (!forming) return series

  if (series.length === 0) return [forming]

  const last = series[series.length - 1]
  if (last.time === forming.time) {
    return sameOhlc(last, forming) ? series : [...series.slice(0, -1), forming]
  }
  if (last.time < forming.time) return [...series, forming]

  const idx = series.findIndex((candle) => candle.time === forming.time)
  if (idx < 0) return series
  return [...series.slice(0, idx), forming]
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
