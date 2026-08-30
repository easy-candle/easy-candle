import { describe, expect, it } from 'vitest'
import type { IChartApi, LogicalRange } from 'lightweight-charts'
import type { Candle } from '@shared/candleUtils'
import {
  currentFocusBars,
  focusHistoryBars,
  focusLogicalRange,
  focusRangeForTime
} from './focusRange'

function candle(time: number): Candle {
  return { time, open: 1, high: 1, low: 1, close: 1, volume: 0 }
}

function chartWithRange(range: LogicalRange | null): IChartApi {
  return {
    timeScale: () => ({ getVisibleLogicalRange: () => range })
  } as unknown as IChartApi
}

const INTERVAL = 60
/** 1000 … 1540 (10 bars). */
const BARS = Array.from({ length: 10 }, (_, i) => candle(1000 + i * INTERVAL))

describe('focusLogicalRange', () => {
  it('centers the viewport on the target bar', () => {
    expect(focusLogicalRange(50, 200, 10)).toEqual({ from: 40, to: 60 })
  })

  it('clamps the left edge to the first bar', () => {
    expect(focusLogicalRange(2, 200, 10)).toEqual({ from: 0, to: 20 })
  })

  it('keeps the requested span when the target is the newest bar', () => {
    expect(focusLogicalRange(9, 10, 4)).toEqual({ from: 5, to: 13 })
  })

  it('clamps a target past the newest bar back into the series', () => {
    expect(focusLogicalRange(40, 10, 4)).toEqual({ from: 5, to: 13 })
  })

  it('returns null without candles or for a non-numeric target', () => {
    expect(focusLogicalRange(5, 0)).toBeNull()
    expect(focusLogicalRange(NaN, 10)).toBeNull()
  })
})

describe('focusRangeForTime', () => {
  it('maps a candle time to a centered viewport', () => {
    expect(focusRangeForTime(1300, BARS, INTERVAL, 2)).toEqual({ from: 3, to: 7 })
  })

  it('clamps a target inside the first bars to the series start', () => {
    expect(focusRangeForTime(1000, BARS, INTERVAL, 2)).toEqual({ from: 0, to: 4 })
  })

  it('includes the forming space of the last bar', () => {
    expect(focusRangeForTime(1540, BARS, INTERVAL, 3)).toEqual({ from: 6, to: 12 })
  })

  it('returns null for times off either end of the series', () => {
    expect(focusRangeForTime(500, BARS, INTERVAL, 2)).toBeNull()
    expect(focusRangeForTime(9000, BARS, INTERVAL, 3)).toBeNull()
  })

  it('returns null for an empty series', () => {
    expect(focusRangeForTime(1300, [], INTERVAL)).toBeNull()
  })
})

describe('currentFocusBars', () => {
  it('halves the current viewport span so the zoom is preserved', () => {
    expect(currentFocusBars(chartWithRange({ from: 10, to: 50 } as never))).toBe(20)
  })

  it('falls back when the chart has no range or a degenerate one', () => {
    expect(currentFocusBars(chartWithRange(null), 7)).toBe(7)
    expect(currentFocusBars(chartWithRange({ from: 5, to: 5 } as never), 7)).toBe(7)
  })

  it('never returns less than one bar either side', () => {
    expect(currentFocusBars(chartWithRange({ from: 0, to: 1 } as never))).toBe(1)
  })
})

describe('focusHistoryBars', () => {
  it('is zero when the target is already loaded', () => {
    expect(focusHistoryBars(1200, 1000, INTERVAL)).toBe(0)
    expect(focusHistoryBars(1000, 1000, INTERVAL)).toBe(0)
  })

  it('counts the bars between the target and the oldest loaded bar', () => {
    expect(focusHistoryBars(940, 1000, INTERVAL)).toBe(1)
    expect(focusHistoryBars(700, 1000, INTERVAL)).toBe(5)
  })

  it('adds the requested lookback context', () => {
    expect(focusHistoryBars(940, 1000, INTERVAL, 10)).toBe(11)
  })

  it('is zero for a non-positive interval or a non-numeric bound', () => {
    expect(focusHistoryBars(940, 1000, 0)).toBe(0)
    expect(focusHistoryBars(NaN, 1000, INTERVAL)).toBe(0)
  })
})
