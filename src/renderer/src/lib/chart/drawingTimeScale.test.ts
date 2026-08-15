import { describe, expect, it } from 'vitest'
import type { Candle } from '@shared/candleUtils'
import { logicalToUnixTime, unixTimeToLogical } from './drawingTimeScale'

function candle(time: number): Candle {
  return { time, open: 1, high: 1, low: 1, close: 1, volume: 0 }
}

const INTERVAL = 60
const BARS = [1000, 1060, 1120].map(candle)

describe('drawingTimeScale', () => {
  it('extrapolates time past the last bar', () => {
    expect(logicalToUnixTime(2, BARS, INTERVAL)).toBe(1120)
    expect(logicalToUnixTime(4, BARS, INTERVAL)).toBe(1240)
    expect(logicalToUnixTime(2.5, BARS, INTERVAL)).toBe(1150)
  })

  it('extrapolates time before the first bar', () => {
    expect(logicalToUnixTime(-1, BARS, INTERVAL)).toBe(940)
  })

  it('maps future unix time back to a logical past the last index', () => {
    expect(unixTimeToLogical(1240, BARS, INTERVAL)).toBe(4)
    expect(unixTimeToLogical(1150, BARS, INTERVAL)).toBe(2.5)
  })

  it('round-trips times in empty space after the last candle', () => {
    const logical = 5
    const time = logicalToUnixTime(logical, BARS, INTERVAL)
    expect(time).not.toBeNull()
    expect(unixTimeToLogical(time as number, BARS, INTERVAL)).toBe(logical)
  })

  it('round-trips fractional logicals in empty space', () => {
    const logical = 2.25
    const time = logicalToUnixTime(logical, BARS, INTERVAL)
    expect(time).toBe(1135)
    expect(unixTimeToLogical(time as number, BARS, INTERVAL)).toBe(logical)
  })

  it('maps in-range times to their bar index', () => {
    expect(unixTimeToLogical(1060, BARS, INTERVAL)).toBe(1)
    expect(logicalToUnixTime(1, BARS, INTERVAL)).toBe(1060)
  })
})
