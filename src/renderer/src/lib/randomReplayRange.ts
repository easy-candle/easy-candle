import { alignTimeToInterval } from '@shared/timeframes'

export type ReplayRangeMode = 'manual' | 'random'

export type RangeUnit = 'day' | 'week' | 'month' | 'year'

const SECONDS_PER_UNIT: Record<RangeUnit, number> = {
  day: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
  year: 365 * 86400
}

export const RANGE_UNITS = Object.freeze(['day', 'week', 'month', 'year'] as const)

export const RANGE_UNIT_LABELS: Record<RangeUnit, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year'
}

export type RandomRangePreset = {
  value: number
  unit: RangeUnit
  label: string
}

export const RANDOM_RANGE_PRESETS: readonly RandomRangePreset[] = [
  { value: 1, unit: 'day', label: '1D' },
  { value: 3, unit: 'day', label: '3D' },
  { value: 1, unit: 'week', label: '1W' },
  { value: 3, unit: 'week', label: '3W' },
  { value: 1, unit: 'month', label: '1M' },
  { value: 3, unit: 'month', label: '3M' },
  { value: 6, unit: 'month', label: '6M' },
  { value: 1, unit: 'year', label: '1Y' }
]

export const DEFAULT_RANGE: RandomRangePreset = { value: 1, unit: 'week', label: '1W' }

/** Live Random search window: last N days ending now (UTC). */
export const RANDOM_LOOKBACK_DAYS = 365

/** Left context bars for imported Random starts (matches Manual import spirit). */
export const IMPORTED_CONTEXT_BARS = 4

function toPositiveInt(value: unknown, fallback = 1): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Duration of a range in seconds. Returns 0 for invalid or non-positive values. */
export function rangeToSeconds(value: unknown, unit: RangeUnit): number {
  const n = toPositiveInt(value, 0)
  if (n <= 0) return 0
  return n * SECONDS_PER_UNIT[unit]
}

/** Number of candles that cover a range for a given timeframe interval. */
export function rangeToCandles(value: unknown, unit: RangeUnit, intervalSeconds: number): number {
  const seconds = rangeToSeconds(value, unit)
  const interval = Math.max(1, Math.floor(Number(intervalSeconds)) || 1)
  if (seconds <= 0) return 0
  return Math.max(1, Math.round(seconds / interval))
}

/**
 * Pick a random candle-open start within the last `lookbackDays`, such that
 * `start + length * interval` stays at or before `nowSeconds`.
 */
export function pickRandomLiveStart(opts: {
  nowSeconds: number
  intervalSeconds: number
  lengthCandles: number
  lookbackDays?: number
  random?: () => number
}): number | null {
  const nowSec = Math.floor(Number(opts.nowSeconds))
  const intervalSec = Math.max(1, Math.floor(Number(opts.intervalSeconds)) || 1)
  const length = toPositiveInt(opts.lengthCandles)
  const lookbackDays = Math.max(1, Math.floor(opts.lookbackDays ?? RANDOM_LOOKBACK_DAYS))
  const random = opts.random ?? Math.random

  if (!Number.isFinite(nowSec) || nowSec <= 0) return null

  const alignedNow = alignTimeToInterval(nowSec, intervalSec)
  // Last valid start: enough bars after the playhead still in the past.
  const maxStart = alignedNow - length * intervalSec
  if (maxStart <= 0) return null

  const lookbackSec = lookbackDays * 24 * 60 * 60
  const minStart = alignTimeToInterval(Math.max(0, nowSec - lookbackSec), intervalSec)

  if (minStart > maxStart) return null

  const spanBars = Math.floor((maxStart - minStart) / intervalSec)
  if (spanBars < 0) return null

  const offsetBars = Math.floor(random() * (spanBars + 1))
  return minStart + offsetBars * intervalSec
}

/**
 * Pick a random start time inside an imported dataset's UTC coverage so that
 * `lengthCandles` bars can still follow the playhead, with optional left
 * context. Works from metadata bounds instead of a loaded array, because
 * imported series are paged in windows.
 *
 * Gaps (weekends/sessions) mean the realised bar count can be lower than
 * `lengthCandles`; callers resolve the returned time to the nearest candle.
 */
export function pickRandomImportedStartTime(opts: {
  firstTime: number
  lastTime: number
  intervalSeconds: number
  lengthCandles: number
  contextBars?: number
  random?: () => number
}): number | null {
  const first = Math.floor(Number(opts.firstTime))
  const last = Math.floor(Number(opts.lastTime))
  const interval = Math.max(1, Math.floor(Number(opts.intervalSeconds)) || 1)
  const length = toPositiveInt(opts.lengthCandles)
  const context = Math.max(0, Math.floor(opts.contextBars ?? IMPORTED_CONTEXT_BARS))
  const random = opts.random ?? Math.random

  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return null

  const minStart = first + context * interval
  const maxStart = last - length * interval

  if (maxStart < minStart) {
    // Coverage too short for full length + context — start as early as possible.
    return Math.min(minStart, last)
  }

  const spanBars = Math.floor((maxStart - minStart) / interval)
  const offsetBars = Math.floor(random() * (spanBars + 1))
  return minStart + offsetBars * interval
}

/**
 * Pick a random start index in an imported series so at least `lengthCandles`
 * bars remain after the playhead, with optional left context.
 *
 * Index-based: only usable when the whole series is in memory (MetaTrader
 * imports). Prefer `pickRandomImportedStartTime` for windowed datasets.
 */
export function pickRandomImportedStartIndex(opts: {
  candleCount: number
  lengthCandles: number
  contextBars?: number
  random?: () => number
}): number | null {
  const count = Math.floor(Number(opts.candleCount))
  const length = toPositiveInt(opts.lengthCandles)
  const context = Math.max(0, Math.floor(opts.contextBars ?? IMPORTED_CONTEXT_BARS))
  const random = opts.random ?? Math.random

  if (!Number.isFinite(count) || count <= 0) return null

  // Need context before + the start bar + (length - 1) more forward bars.
  const minForward = Math.max(1, length)
  const minIndex = Math.min(context, Math.max(0, count - 1))
  const maxIndex = count - minForward

  if (maxIndex < minIndex) {
    // Series too short for full length + context — start as early as possible
    // while leaving whatever forward room exists.
    return Math.max(0, Math.min(minIndex, count - 1))
  }

  const span = maxIndex - minIndex
  return minIndex + Math.floor(random() * (span + 1))
}
