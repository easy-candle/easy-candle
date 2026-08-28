import { describe, expect, it } from 'vitest'
import type { Candle } from '@shared/candleUtils'
import { atrSeries, trueRange } from './atr'

function bar(i: number, high: number, low: number, close: number): Candle {
  return { time: 1_700_000_000 + i * 60, open: close, high, low, close }
}

describe('atrSeries', () => {
  it('is null until `period` bars exist', () => {
    const candles = [bar(0, 2, 1, 1.5), bar(1, 3, 2, 2.5)]
    expect(atrSeries(candles, 3)).toEqual([null, null])
  })

  it('seeds with SMA of true range then applies Wilder RMA', () => {
    const candles = [
      bar(0, 2, 1, 1.5),
      bar(1, 3, 1.5, 2),
      bar(2, 4, 2, 3)
    ]
    const tr0 = trueRange(candles, 0)
    const tr1 = trueRange(candles, 1)
    const tr2 = trueRange(candles, 2)
    const seed = (tr0 + tr1 + tr2) / 3
    const series = atrSeries(candles, 3)
    expect(series[2]).toBeCloseTo(seed)

    const extra = [...candles, bar(3, 5, 3, 4)]
    const next = (seed * 2 + trueRange(extra, 3)) / 3
    expect(atrSeries(extra, 3)[3]).toBeCloseTo(next)
  })
})
