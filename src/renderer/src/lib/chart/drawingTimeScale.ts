import type { IChartApi, Logical } from 'lightweight-charts'
import type { Candle } from '@shared/candleUtils'

const INDEX_ZERO = 0 as Logical
const INDEX_ONE = 1 as Logical

/** LWC returns 0 for non-integer logicals; sample two integer indexes instead. */
function indexUnitX(chart: IChartApi): { x0: number; unit: number } | null {
  const x0 = chart.timeScale().logicalToCoordinate(INDEX_ZERO)
  const x1 = chart.timeScale().logicalToCoordinate(INDEX_ONE)
  if (x0 == null || x1 == null) return null
  const unit = x1 - x0
  if (!Number.isFinite(unit) || unit === 0) return null
  return { x0, unit }
}

/** Map a logical index to unix seconds, including empty space past the last bar. */
export function logicalToUnixTime(
  logical: number,
  candles: Candle[],
  intervalSeconds: number
): number | null {
  if (!candles.length || !Number.isFinite(logical) || intervalSeconds <= 0) return null
  const lastIndex = candles.length - 1
  if (logical > lastIndex) {
    return candles[lastIndex].time + (logical - lastIndex) * intervalSeconds
  }
  if (logical < 0) {
    return candles[0].time + logical * intervalSeconds
  }
  const lo = Math.floor(logical)
  const hi = Math.min(lastIndex, Math.ceil(logical))
  const a = candles[lo]
  const b = candles[hi]
  if (!a) return null
  if (!b || hi === lo) return a.time
  return a.time + (b.time - a.time) * (logical - lo)
}

/** Inverse of logicalToUnixTime for overlay rendering outside the series. */
export function unixTimeToLogical(
  time: number,
  candles: Candle[],
  intervalSeconds: number
): number | null {
  if (!candles.length || !Number.isFinite(time) || intervalSeconds <= 0) return null
  const lastIndex = candles.length - 1
  const first = candles[0].time
  const last = candles[lastIndex].time
  if (time >= last) return lastIndex + (time - last) / intervalSeconds
  if (time <= first) return (time - first) / intervalSeconds

  let lo = 0
  let hi = lastIndex
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (candles[mid].time < time) lo = mid + 1
    else hi = mid
  }
  if (candles[lo].time === time) return lo
  const prev = Math.max(0, lo - 1)
  const a = candles[prev]
  const b = candles[lo]
  if (!a || !b || b.time === a.time) return prev
  return prev + (time - a.time) / (b.time - a.time)
}

export function logicalToX(chart: IChartApi, logical: number): number | null {
  if (!Number.isFinite(logical)) return null
  const unit = indexUnitX(chart)
  if (!unit) return null
  return unit.x0 + unit.unit * logical
}

export function xToUnixTime(
  chart: IChartApi,
  x: number,
  candles: Candle[],
  intervalSeconds: number
): number | null {
  const unit = indexUnitX(chart)
  if (!unit) return null
  const logical = (x - unit.x0) / unit.unit
  return logicalToUnixTime(logical, candles, intervalSeconds)
}

export function isTimeInSeriesRange(
  time: number,
  candles: Candle[],
  intervalSeconds = 0
): boolean {
  if (!candles.length || !Number.isFinite(time)) return false
  const first = candles[0].time
  const last = candles[candles.length - 1].time
  if (time < first) return false
  const step = Math.max(0, Math.floor(Number(intervalSeconds)) || 0)
  if (step > 0) return time < last + step
  return time <= last
}
