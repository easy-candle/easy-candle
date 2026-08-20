/** Chart candles use `time` in UTC seconds. */

export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

/**
 * Binance kline row:
 * [ openTimeMs, open, high, low, close, volume, closeTime, ... ]
 */
export function mapBinanceKline(row: unknown[]): Candle | null {
  if (!Array.isArray(row) || row.length < 6) return null

  const openTimeMs = Number(row[0])
  const open = Number(row[1])
  const high = Number(row[2])
  const low = Number(row[3])
  const close = Number(row[4])
  const volume = Number(row[5])

  if (
    !Number.isFinite(openTimeMs) ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return null
  }

  const candle: Candle = {
    time: Math.floor(openTimeMs / 1000),
    open,
    high,
    low,
    close
  }

  if (Number.isFinite(volume)) {
    candle.volume = volume
  }

  return candle
}

export function mapBinanceKlines(rows: unknown): Candle[] {
  if (!Array.isArray(rows)) return []

  const candles: Candle[] = []
  for (const row of rows) {
    const candle = mapBinanceKline(row as unknown[])
    if (candle) candles.push(candle)
  }
  return candles
}

/** Keep first occurrence per `time`, then sort ascending. */
export function dedupeCandlesByTime(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>()
  for (const candle of candles) {
    if (!byTime.has(candle.time)) {
      byTime.set(candle.time, candle)
    }
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time)
}

/**
 * Merge two series by open time. Incoming bars replace the same `time`.
 * Older bars that incoming did not send are kept.
 */
export function mergeCandlesByTime(existing: Candle[], incoming: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>()
  if (Array.isArray(existing)) {
    for (const candle of existing) {
      if (candle && Number.isFinite(candle.time)) byTime.set(candle.time, candle)
    }
  }
  if (Array.isArray(incoming)) {
    for (const candle of incoming) {
      if (candle && Number.isFinite(candle.time)) byTime.set(candle.time, candle)
    }
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time)
}

/** Clamp requested limit to Binance's allowed range. */
export function clampKlineLimit(value: unknown, fallback = 500): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1000, Math.max(1, Math.floor(n)))
}

/**
 * Largest index whose candle `time` is ≤ `timeSeconds` (UTC seconds).
 * Candles must be sorted ascending by `time`.
 */
export function findIndexAtOrBefore(candles: Candle[], timeSeconds: number): number {
  if (!Array.isArray(candles) || candles.length === 0) return -1

  const target = Number(timeSeconds)
  if (!Number.isFinite(target)) return -1

  let lo = 0
  let hi = candles.length - 1
  let answer = -1

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const t = candles[mid].time
    if (t <= target) {
      answer = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return answer
}
