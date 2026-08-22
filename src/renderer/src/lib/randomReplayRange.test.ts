import { describe, expect, it } from 'vitest'
import {
  IMPORTED_CONTEXT_BARS,
  pickRandomImportedStartIndex,
  pickRandomImportedStartTime,
  pickRandomLiveStart,
  RANDOM_LOOKBACK_DAYS,
  RANDOM_RANGE_PRESETS,
  rangeToCandles,
  rangeToSeconds
} from './randomReplayRange'

describe('rangeToSeconds', () => {
  it('returns 0 for invalid or non-positive values', () => {
    expect(rangeToSeconds(undefined, 'day')).toBe(0)
    expect(rangeToSeconds(NaN, 'day')).toBe(0)
    expect(rangeToSeconds(0, 'day')).toBe(0)
    expect(rangeToSeconds(-3, 'week')).toBe(0)
  })

  it('converts units to seconds', () => {
    expect(rangeToSeconds(1, 'day')).toBe(86400)
    expect(rangeToSeconds(2, 'week')).toBe(2 * 7 * 86400)
    expect(rangeToSeconds(3, 'month')).toBe(3 * 30 * 86400)
    expect(rangeToSeconds(1, 'year')).toBe(365 * 86400)
  })

  it('floors fractional values', () => {
    expect(rangeToSeconds(2.9, 'day')).toBe(2 * 86400)
  })
})

describe('rangeToCandles', () => {
  it('converts a duration to a candle count for an interval', () => {
    expect(rangeToCandles(1, 'day', 900)).toBe(96)
    expect(rangeToCandles(1, 'week', 3600)).toBe(168)
    expect(rangeToCandles(1, 'day', 86400)).toBe(1)
  })

  it('returns 0 for invalid values', () => {
    expect(rangeToCandles(0, 'day', 900)).toBe(0)
    expect(rangeToCandles(NaN, 'day', 900)).toBe(0)
  })
})

describe('RANDOM_RANGE_PRESETS', () => {
  it('matches the quick-select set', () => {
    expect(RANDOM_RANGE_PRESETS.map((p) => p.label)).toEqual([
      '1D',
      '3D',
      '1W',
      '3W',
      '1M',
      '3M',
      '6M',
      '1Y'
    ])
  })
})

describe('pickRandomLiveStart', () => {
  const interval = 900 // 15m
  const now = 1_700_000_000

  it('returns null when now is invalid', () => {
    expect(
      pickRandomLiveStart({
        nowSeconds: NaN,
        intervalSeconds: interval,
        lengthCandles: 500
      })
    ).toBeNull()
  })

  it('aligns to the interval and stays within lookback', () => {
    const start = pickRandomLiveStart({
      nowSeconds: now,
      intervalSeconds: interval,
      lengthCandles: 500,
      random: () => 0
    })

    expect(start).not.toBeNull()
    expect(start! % interval).toBe(0)

    const lookbackSec = RANDOM_LOOKBACK_DAYS * 24 * 60 * 60
    expect(start!).toBeGreaterThanOrEqual(now - lookbackSec - interval)
    expect(start! + 500 * interval).toBeLessThanOrEqual(now)
  })

  it('uses max start when random is 1 (exclusive upper via floor)', () => {
    // random() === 0.999… → last bar in span
    const start = pickRandomLiveStart({
      nowSeconds: now,
      intervalSeconds: interval,
      lengthCandles: 100,
      random: () => 0.999999
    })

    const maxStart = Math.floor(now / interval) * interval - 100 * interval
    expect(start).toBe(maxStart)
  })

  it('returns null when length cannot fit in lookback', () => {
    const result = pickRandomLiveStart({
      nowSeconds: 10_000,
      intervalSeconds: 86400,
      lengthCandles: 2000,
      lookbackDays: 1,
      random: () => 0
    })
    expect(result).toBeNull()
  })
})

describe('pickRandomImportedStartIndex', () => {
  it('returns null for empty series', () => {
    expect(pickRandomImportedStartIndex({ candleCount: 0, lengthCandles: 100 })).toBeNull()
  })

  it('respects context and length bounds', () => {
    const index = pickRandomImportedStartIndex({
      candleCount: 1000,
      lengthCandles: 100,
      random: () => 0
    })
    expect(index).toBe(IMPORTED_CONTEXT_BARS)
  })

  it('picks the latest valid index when random is near 1', () => {
    const index = pickRandomImportedStartIndex({
      candleCount: 1000,
      lengthCandles: 100,
      random: () => 0.999999
    })
    expect(index).toBe(1000 - 100)
  })

  it('falls back when series is shorter than length + context', () => {
    const index = pickRandomImportedStartIndex({
      candleCount: 30,
      lengthCandles: 500,
      random: () => 0
    })
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(30)
  })
})

describe('pickRandomImportedStartTime', () => {
  const interval = 900 // 15m
  const first = 1_600_000_000 - (1_600_000_000 % interval)
  const last = first + 999 * interval // 1000 bars of coverage

  it('returns null when coverage bounds are invalid', () => {
    expect(
      pickRandomImportedStartTime({
        firstTime: last,
        lastTime: first,
        intervalSeconds: interval,
        lengthCandles: 10
      })
    ).toBeNull()
  })

  it('respects the context offset at the low end', () => {
    const start = pickRandomImportedStartTime({
      firstTime: first,
      lastTime: last,
      intervalSeconds: interval,
      lengthCandles: 100,
      random: () => 0
    })
    expect(start).toBe(first + IMPORTED_CONTEXT_BARS * interval)
  })

  it('leaves room for the requested length at the high end', () => {
    const start = pickRandomImportedStartTime({
      firstTime: first,
      lastTime: last,
      intervalSeconds: interval,
      lengthCandles: 100,
      random: () => 0.999999
    })
    expect(start).toBe(last - 100 * interval)
    expect(start! + 100 * interval).toBeLessThanOrEqual(last)
  })

  it('stays aligned to the interval grid', () => {
    const start = pickRandomImportedStartTime({
      firstTime: first,
      lastTime: last,
      intervalSeconds: interval,
      lengthCandles: 50,
      random: () => 0.37
    })
    expect((start! - first) % interval).toBe(0)
  })

  it('clamps into coverage when the range is longer than the dataset', () => {
    const start = pickRandomImportedStartTime({
      firstTime: first,
      lastTime: first + 10 * interval,
      intervalSeconds: interval,
      lengthCandles: 5000,
      random: () => 0
    })
    expect(start).not.toBeNull()
    expect(start!).toBeGreaterThanOrEqual(first)
    expect(start!).toBeLessThanOrEqual(first + 10 * interval)
  })
})
