import { describe, expect, it } from 'vitest'
import type { Candle } from '@shared/candleUtils'
import {
  buildHeikinAshiPoint,
  buildSeriesData,
  CHART_TYPES,
  isChartType,
  toHeikinAshi
} from './chartTypes'

const candles: Candle[] = [
  { time: 100, open: 10, high: 12, low: 9, close: 11 },
  { time: 200, open: 11, high: 15, low: 10, close: 14 },
  { time: 300, open: 14, high: 14, low: 8, close: 9 }
]

describe('CHART_TYPES', () => {
  it('starts with candlestick as the default type', () => {
    expect(CHART_TYPES[0].id).toBe('candlestick')
  })

  it('exposes the supported types', () => {
    expect(CHART_TYPES.map((entry) => entry.id)).toEqual([
      'candlestick',
      'heikinashi',
      'line',
      'bar'
    ])
  })
})

describe('isChartType', () => {
  it('accepts known types and rejects everything else', () => {
    expect(isChartType('candlestick')).toBe(true)
    expect(isChartType('heikinashi')).toBe(true)
    expect(isChartType('line')).toBe(true)
    expect(isChartType('bar')).toBe(true)
    expect(isChartType('renko')).toBe(false)
    expect(isChartType(undefined)).toBe(false)
  })
})

describe('toHeikinAshi', () => {
  it('builds the HA open from the previous HA midpoint', () => {
    const ha = toHeikinAshi(candles)
    expect(ha).toHaveLength(3)

    // HA close = (O+H+L+C)/4
    const c0 = candles[0]
    expect(ha[0].close).toBeCloseTo((c0.open + c0.high + c0.low + c0.close) / 4)
    // First HA open seeds from the raw candle midpoint.
    expect(ha[0].open).toBeCloseTo((c0.open + c0.close) / 2)
    // HA high/low envelope the HA open & close.
    expect(ha[0].high).toBe(c0.high)
    expect(ha[0].low).toBe(c0.low)

    // Second HA open = midpoint of first HA open/close.
    expect(ha[1].open).toBeCloseTo((ha[0].open + ha[0].close) / 2)
    expect(ha[1].high).toBe(candles[1].high)
    expect(ha[1].low).toBe(candles[1].low)

    // Third candle: raw low (8) is below both HA open/close, so it wins.
    expect(ha[2].low).toBe(8)
  })

  it('keeps time and volume', () => {
    const withVolume: Candle[] = [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 123 }]
    const ha = toHeikinAshi(withVolume)
    expect(ha[0].time).toBe(1)
    expect(ha[0].volume).toBe(123)
  })

  it('returns an empty array for empty input', () => {
    expect(toHeikinAshi([])).toEqual([])
  })

  it('is incremental-safe: appending matches a full recompute', () => {
    const full = toHeikinAshi(candles)
    const incremental = [buildHeikinAshiPoint(null, candles[0])]
    incremental.push(buildHeikinAshiPoint(incremental[0], candles[1]))
    incremental.push(buildHeikinAshiPoint(incremental[1], candles[2]))
    expect(incremental).toEqual(full)
  })
})

describe('buildSeriesData', () => {
  it('maps candles 1:1 for candlestick and bar', () => {
    for (const type of ['candlestick', 'bar'] as const) {
      const data = buildSeriesData(type, candles)
      expect(data).toHaveLength(candles.length)
      const first = data[0] as { open: number; close: number }
      expect(first.open).toBe(candles[0].open)
      expect(first.close).toBe(candles[0].close)
    }
  })

  it('emits line points from the close', () => {
    const data = buildSeriesData('line', candles) as Array<{ value: number }>
    expect(data.map((point) => point.value)).toEqual([11, 14, 9])
  })

  it('emits heikin ashi candles', () => {
    const data = buildSeriesData('heikinashi', candles) as Array<{ close: number }>
    const ha = toHeikinAshi(candles)
    expect(data.map((point) => point.close)).toEqual(ha.map((point) => point.close))
  })

  it('returns an empty array for empty input', () => {
    for (const type of ['candlestick', 'heikinashi', 'line', 'bar'] as const) {
      expect(buildSeriesData(type, [])).toEqual([])
    }
  })
})
