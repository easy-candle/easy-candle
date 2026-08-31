import type { Candle } from './candleUtils'
import {
  IMPORT_BUILD_STAGE_PERCENT,
  IMPORT_BUILD_UI_PERCENT,
  IMPORT_WORKER_PROGRESS_EVERY
} from './importJobProgress'
import { TIMEFRAMES } from './timeframes'

/** Timeframes derived from an imported 1m series (excludes source 1m). */
export const IMPORT_DERIVED_TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'] as const

/** All timeframes stored for an imported symbol. */
export const IMPORT_STORED_TIMEFRAMES = ['1m', ...IMPORT_DERIVED_TIMEFRAMES] as const

export type ImportStoredTimeframe = (typeof IMPORT_STORED_TIMEFRAMES)[number]

export type ImportBuildProgress = {
  phase: string
  percent: number
}

/**
 * Aggregate lower-timeframe candles into a higher interval in one linear pass.
 * Open time is floored to `intervalSeconds` (UTC). Incomplete final buckets are kept.
 */
export function aggregateCandles(
  candles: Candle[],
  intervalSeconds: number,
  onChunk?: (processed: number, total: number) => void
): Candle[] {
  const step = Math.max(1, Math.floor(intervalSeconds) || 1)
  if (!Array.isArray(candles) || candles.length === 0) return []

  const total = candles.length
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

  for (let i = 0; i < total; i += 1) {
    const candle = candles[i]
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
    } else {
      high = Math.max(high, candle.high)
      low = Math.min(low, candle.low)
      close = candle.close
      if (candle.volume != null) {
        volume += candle.volume
        hasVolume = true
      }
    }

    const processed = i + 1
    if (onChunk && (processed % IMPORT_WORKER_PROGRESS_EVERY === 0 || processed === total)) {
      onChunk(processed, total)
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

/**
 * Nested intervals: each derived TF is built from the previous one
 * (5m←1m, 15m←5m, 1h←15m, …) instead of scanning 1m five times.
 */
function cascadeSourceId(derivedIndex: number): string {
  return derivedIndex <= 0 ? '1m' : IMPORT_DERIVED_TIMEFRAMES[derivedIndex - 1]
}

function buildDerivedTimeframes(
  candles1m: Candle[],
  onProgress?: (progress: ImportBuildProgress) => void
): Record<string, Candle[]> {
  const result: Record<string, Candle[]> = {
    '1m': candles1m
  }

  for (let i = 0; i < IMPORT_DERIVED_TIMEFRAMES.length; i += 1) {
    const id = IMPORT_DERIVED_TIMEFRAMES[i]
    const tf = TIMEFRAMES[id]
    if (!tf) continue

    const source = result[cascadeSourceId(i)] || candles1m
    const stageEnd = IMPORT_BUILD_STAGE_PERCENT[id] ?? IMPORT_BUILD_UI_PERCENT.ready
    const stageStart = i === 0 ? IMPORT_BUILD_UI_PERCENT.tf5mStart : stageEnd
    onProgress?.({ phase: `Building ${id}…`, percent: stageStart })

    result[id] = aggregateCandles(
      source,
      tf.seconds,
      i === 0
        ? (processed, count) => {
            onProgress?.({
              phase: `Building ${id}…`,
              percent:
                IMPORT_BUILD_UI_PERCENT.tf5mStart +
                Math.round((processed / Math.max(count, 1)) * IMPORT_BUILD_UI_PERCENT.tf5mEnd)
            })
          }
        : undefined
    )

    if (i > 0) {
      onProgress?.({ phase: `Building ${id}…`, percent: stageEnd })
    }
  }

  onProgress?.({ phase: 'Timeframes ready', percent: IMPORT_BUILD_UI_PERCENT.ready })
  return result
}

/** Build 1m + derived TF maps from a validated 1-minute series. */
export function buildImportTimeframes(candles1m: Candle[]): Record<string, Candle[]> {
  return buildDerivedTimeframes(candles1m)
}

/** Same as `buildImportTimeframes`, with UI-mapped progress (0–63). */
export function buildImportTimeframesWithProgress(
  candles1m: Candle[],
  onProgress?: (progress: ImportBuildProgress) => void
): Record<string, Candle[]> {
  return buildDerivedTimeframes(candles1m, onProgress)
}

/** Async alias so existing callers/tests can await the same linear builder. */
export async function buildImportTimeframesAsync(
  candles1m: Candle[],
  onProgress?: (progress: ImportBuildProgress) => void
): Promise<Record<string, Candle[]>> {
  return buildImportTimeframesWithProgress(candles1m, onProgress)
}
