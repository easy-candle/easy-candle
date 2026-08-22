import { describe, expect, it } from 'vitest'
import { sliceCandleRange } from './importRange'
import type { Candle } from './candleUtils'

function series(count: number, step = 60, start = 1_000_000): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    time: start + i * step,
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5
  }))
}

describe('sliceCandleRange', () => {
  it('returns the whole series when no range is given', () => {
    const candles = series(5)
    const result = sliceCandleRange(candles)
    expect(result.candles).toHaveLength(5)
    expect(result.window).toEqual({
      loadedFrom: candles[0].time,
      loadedTo: candles[4].time,
      hasMoreBefore: false,
      hasMoreAfter: false,
      totalCount: 5
    })
  })

  it('handles an empty series', () => {
    const result = sliceCandleRange([], { limit: 10 })
    expect(result.candles).toEqual([])
    expect(result.window.totalCount).toBe(0)
    expect(result.window.hasMoreBefore).toBe(false)
    expect(result.window.hasMoreAfter).toBe(false)
  })

  it('keeps the newest bars when only a limit is given', () => {
    const candles = series(10)
    const result = sliceCandleRange(candles, { limit: 3 })
    expect(result.candles.map((c) => c.time)).toEqual([
      candles[7].time,
      candles[8].time,
      candles[9].time
    ])
    expect(result.window.hasMoreBefore).toBe(true)
    expect(result.window.hasMoreAfter).toBe(false)
    expect(result.window.totalCount).toBe(10)
  })

  it('pages forward from startTime, keeping the first limit bars', () => {
    const candles = series(10)
    const result = sliceCandleRange(candles, { startTime: candles[2].time, limit: 3 })
    expect(result.candles.map((c) => c.time)).toEqual([
      candles[2].time,
      candles[3].time,
      candles[4].time
    ])
    expect(result.window.hasMoreBefore).toBe(true)
    expect(result.window.hasMoreAfter).toBe(true)
  })

  it('pages backward from endTime, keeping the last limit bars', () => {
    const candles = series(10)
    const result = sliceCandleRange(candles, { endTime: candles[5].time, limit: 3 })
    expect(result.candles.map((c) => c.time)).toEqual([
      candles[3].time,
      candles[4].time,
      candles[5].time
    ])
    expect(result.window.hasMoreBefore).toBe(true)
    expect(result.window.hasMoreAfter).toBe(true)
  })

  it('treats startTime and endTime as inclusive bounds', () => {
    const candles = series(10)
    const result = sliceCandleRange(candles, {
      startTime: candles[2].time,
      endTime: candles[4].time
    })
    expect(result.candles.map((c) => c.time)).toEqual([
      candles[2].time,
      candles[3].time,
      candles[4].time
    ])
  })

  it('snaps bounds that fall between candles', () => {
    const candles = series(10)
    const result = sliceCandleRange(candles, {
      startTime: candles[2].time + 1,
      endTime: candles[5].time - 1
    })
    expect(result.candles.map((c) => c.time)).toEqual([candles[3].time, candles[4].time])
  })

  it('reports an empty window when the range misses the series', () => {
    const candles = series(5)
    const result = sliceCandleRange(candles, { startTime: candles[4].time + 60 })
    expect(result.candles).toEqual([])
    expect(result.window.hasMoreBefore).toBe(true)
    expect(result.window.hasMoreAfter).toBe(false)
    expect(result.window.totalCount).toBe(5)
  })

  it('clamps to the series when the range is wider than the data', () => {
    const candles = series(4)
    const result = sliceCandleRange(candles, {
      startTime: 0,
      endTime: candles[3].time + 10_000,
      limit: 100
    })
    expect(result.candles).toHaveLength(4)
    expect(result.window.hasMoreBefore).toBe(false)
    expect(result.window.hasMoreAfter).toBe(false)
  })

  it('ignores invalid limits', () => {
    const candles = series(6)
    expect(sliceCandleRange(candles, { limit: 0 }).candles).toHaveLength(6)
    expect(sliceCandleRange(candles, { limit: -5 }).candles).toHaveLength(6)
    expect(sliceCandleRange(candles, { limit: Number.NaN }).candles).toHaveLength(6)
  })
})
