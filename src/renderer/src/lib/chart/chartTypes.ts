import type { BarData, LineData, Time } from 'lightweight-charts'
import type { Candle } from '@shared/candleUtils'

export type ChartType = 'candlestick' | 'heikinashi' | 'line' | 'bar'

export const CHART_TYPES: ReadonlyArray<{ id: ChartType; label: string }> = [
  { id: 'candlestick', label: 'Candlestick' },
  { id: 'heikinashi', label: 'Heikin Ashi' },
  { id: 'line', label: 'Line' },
  { id: 'bar', label: 'Bar' }
]

export function isChartType(value: unknown): value is ChartType {
  return CHART_TYPES.some((entry) => entry.id === value)
}

/**
 * Compute one Heikin Ashi candle from a raw OHLC candle. The previous HA
 * candle is only used for its open/close (the HA open is their midpoint).
 */
export function buildHeikinAshiPoint(prev: Candle | null, candle: Candle): Candle {
  const haClose = (candle.open + candle.high + candle.low + candle.close) / 4
  const haOpen = prev == null ? (candle.open + candle.close) / 2 : (prev.open + prev.close) / 2
  const haHigh = Math.max(candle.high, haOpen, haClose)
  const haLow = Math.min(candle.low, haOpen, haClose)
  return {
    time: candle.time,
    open: haOpen,
    high: haHigh,
    low: haLow,
    close: haClose,
    ...(candle.volume != null ? { volume: candle.volume } : {})
  }
}

export function toHeikinAshi(candles: Candle[]): Candle[] {
  if (!Array.isArray(candles)) return []
  const out: Candle[] = []
  let prev: Candle | null = null
  for (const candle of candles) {
    const next = buildHeikinAshiPoint(prev, candle)
    out.push(next)
    prev = next
  }
  return out
}

export type ChartSeriesData = Array<BarData<Time> | LineData<Time>>

export function buildSeriesData(type: ChartType, candles: Candle[]): ChartSeriesData {
  if (!Array.isArray(candles)) return []

  if (type === 'line') {
    return candles.map((candle) => ({
      time: candle.time as Time,
      value: candle.close
    }))
  }

  const source = type === 'heikinashi' ? toHeikinAshi(candles) : candles
  return source.map((candle) => ({
    time: candle.time as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  }))
}
