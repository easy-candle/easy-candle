import { describe, expect, it } from 'vitest'
import {
  clampRandomLength,
  DEFAULT_RANDOM_LENGTH,
  IMPORTED_CONTEXT_BARS,
  pickRandomImportedStartIndex,
  pickRandomLiveStart,
  RANDOM_LOOKBACK_DAYS
} from './randomReplayRange'

describe('clampRandomLength', () => {
  it('returns default for non-finite values', () => {
    expect(clampRandomLength(undefined)).toBe(DEFAULT_RANDOM_LENGTH)
    expect(clampRandomLength(NaN)).toBe(DEFAULT_RANDOM_LENGTH)
    expect(clampRandomLength('x')).toBe(DEFAULT_RANDOM_LENGTH)
  })

  it('clamps to 50–2000 and floors', () => {
    expect(clampRandomLength(10)).toBe(50)
    expect(clampRandomLength(5000)).toBe(2000)
    expect(clampRandomLength(250.9)).toBe(250)
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
    expect(
      pickRandomImportedStartIndex({ candleCount: 0, lengthCandles: 100 })
    ).toBeNull()
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
