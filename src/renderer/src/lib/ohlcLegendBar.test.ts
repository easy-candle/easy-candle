import { describe, expect, it } from 'vitest'
import { sameBar, type LegendBar } from './ohlcLegendBar'

function ohlc(time: number, open = 1, high = 2, low = 0.5, close = 1.5): LegendBar {
  return { time, open, high, low, close }
}

function line(time: number, value = 10): LegendBar {
  return { time, value }
}

describe('sameBar', () => {
  it('treats identical references and both-null as equal', () => {
    const bar = ohlc(100)
    expect(sameBar(bar, bar)).toBe(true)
    expect(sameBar(null, null)).toBe(true)
  })

  it('treats null vs a bar as different', () => {
    expect(sameBar(null, ohlc(100))).toBe(false)
    expect(sameBar(ohlc(100), null)).toBe(false)
  })

  it('ignores a new object when time and OHLC match', () => {
    expect(sameBar(ohlc(100, 1, 2, 0.5, 1.5), ohlc(100, 1, 2, 0.5, 1.5))).toBe(true)
  })

  it('detects a different candle time or OHLC', () => {
    expect(sameBar(ohlc(100), ohlc(200))).toBe(false)
    expect(sameBar(ohlc(100, 1), ohlc(100, 1.1))).toBe(false)
    expect(sameBar(ohlc(100, 1, 2), ohlc(100, 1, 2.2))).toBe(false)
    expect(sameBar(ohlc(100, 1, 2, 0.5), ohlc(100, 1, 2, 0.4))).toBe(false)
    expect(sameBar(ohlc(100, 1, 2, 0.5, 1.5), ohlc(100, 1, 2, 0.5, 1.6))).toBe(false)
  })

  it('compares line series by time and value', () => {
    expect(sameBar(line(50, 9), line(50, 9))).toBe(true)
    expect(sameBar(line(50, 9), line(50, 10))).toBe(false)
    expect(sameBar(line(50, 9), line(51, 9))).toBe(false)
    expect(sameBar(line(50, 9), ohlc(50))).toBe(false)
  })

  it('compares business-day times field-wise', () => {
    const a: LegendBar = { time: { year: 2024, month: 1, day: 2 }, open: 1, high: 1, low: 1, close: 1 }
    const b: LegendBar = { time: { year: 2024, month: 1, day: 2 }, open: 1, high: 1, low: 1, close: 1 }
    const c: LegendBar = { time: { year: 2024, month: 1, day: 3 }, open: 1, high: 1, low: 1, close: 1 }
    expect(sameBar(a, b)).toBe(true)
    expect(sameBar(a, c)).toBe(false)
  })
})
