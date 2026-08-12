import { alignTimeToInterval } from '@shared/timeframes'

export type ReplayRangeMode = 'manual' | 'random'

/** Default forward session length (candles) for Random mode. */
export const DEFAULT_RANDOM_LENGTH = 500

/** Preset lengths shown in the Random UI. */
export const RANDOM_LENGTH_PRESETS = Object.freeze([100, 250, 500, 1000] as const)

const MIN_LENGTH = 50
const MAX_LENGTH = 2000

/** Live Random search window: last N days ending now (UTC). */
export const RANDOM_LOOKBACK_DAYS = 365

/** Left context bars for imported Random starts (matches Manual import spirit). */
export const IMPORTED_CONTEXT_BARS = 4

export function clampRandomLength(value: unknown, fallback = DEFAULT_RANDOM_LENGTH): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, Math.floor(n)))
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
  const length = clampRandomLength(opts.lengthCandles)
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
 * Pick a random start index in an imported series so at least `lengthCandles`
 * bars remain after the playhead, with optional left context.
 */
export function pickRandomImportedStartIndex(opts: {
  candleCount: number
  lengthCandles: number
  contextBars?: number
  random?: () => number
}): number | null {
  const count = Math.floor(Number(opts.candleCount))
  const length = clampRandomLength(opts.lengthCandles)
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
