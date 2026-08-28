import type { Candle } from '@shared/candleUtils'

export function trueRange(candles: Candle[], index: number): number {
  const bar = candles[index]
  if (!bar) return 0
  const range = bar.high - bar.low
  if (index === 0) return range
  const prevClose = candles[index - 1]?.close ?? bar.close
  return Math.max(range, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose))
}

/**
 * Wilder ATR, same construction as Pine `ta.atr(period)`:
 * SMA of true range for the first `period` bars, then RMA.
 * Returns null until `period` bars are available.
 */
export function atrSeries(candles: Candle[], period: number): Array<number | null> {
  const n = candles.length
  const out: Array<number | null> = Array.from({ length: n }, () => null)
  const length = Math.max(1, Math.floor(Number(period) || 1))
  if (n < length) return out

  let sum = 0
  for (let i = 0; i < length; i += 1) sum += trueRange(candles, i)
  let atr = sum / length
  out[length - 1] = atr

  for (let i = length; i < n; i += 1) {
    atr = (atr * (length - 1) + trueRange(candles, i)) / length
    out[i] = atr
  }
  return out
}
