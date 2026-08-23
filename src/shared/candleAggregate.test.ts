import { describe, expect, it } from 'vitest'
import { aggregateCandles, buildImportTimeframes } from './candleAggregate'
import type { Candle } from './candleUtils'
import { hasNewerCandles } from './datasetTypes'

function series(count: number, stepSec: number, start = 1_700_000_000): Candle[] {
  const out: Candle[] = []
  for (let i = 0; i < count; i += 1) {
    const open = 100 + i
    out.push({
      time: start + i * stepSec,
      open,
      high: open + 1,
      low: open - 1,
      close: open + 0.5,
      volume: 2
    })
  }
  return out
}

describe('aggregateCandles', () => {
  it('aggregates 1m into 5m OHLC', () => {
    const start = 1_700_000_100 // divisible by 300
    expect(start % 300).toBe(0)
    const candles = series(10, 60, start)
    const agg = aggregateCandles(candles, 300)
    expect(agg).toHaveLength(2)
    expect(agg[0]).toMatchObject({
      time: start,
      open: 100,
      high: 105,
      low: 99,
      close: 104.5,
      volume: 10
    })
    expect(agg[1].time).toBe(start + 300)
  })

  it('floors open times onto the interval grid', () => {
    const bucket = 1_700_000_100
    expect(bucket % 300).toBe(0)
    const candles = series(5, 60, bucket + 90)
    const agg = aggregateCandles(candles, 300)
    expect(agg[0].time).toBe(bucket)
  })
})

describe('buildImportTimeframes', () => {
  it('builds all derived timeframes from 1m', () => {
    const candles1m = series(60 * 24, 60, 0)
    const map = buildImportTimeframes(candles1m)
    expect(map['1m']).toHaveLength(60 * 24)
    expect(map['5m']?.length).toBe(12 * 24)
    expect(map['15m']?.length).toBe(4 * 24)
    expect(map['1h']?.length).toBe(24)
    expect(map['4h']?.length).toBe(6)
    expect(map['1d']?.length).toBe(1)
  })
})

describe('hasNewerCandles', () => {
  it('detects newer last open time', () => {
    const existing = series(5, 60)
    const incoming = series(6, 60)
    expect(hasNewerCandles(existing, incoming)).toBe(true)
    expect(hasNewerCandles(incoming, existing)).toBe(false)
    expect(hasNewerCandles(existing, existing)).toBe(false)
  })
})
