import { describe, expect, it } from 'vitest'
import {
  floorToInterval,
  forexNyCloseOffsetSeconds,
  importedForexSessionOffset
} from './forexSession'

function utcSeconds(year: number, month: number, day: number, hour: number, minute = 0): number {
  return Date.UTC(year, month, day, hour, minute, 0) / 1000
}

describe('forexNyCloseOffsetSeconds', () => {
  it('uses 21h during EDT (28 Aug 2020)', () => {
    expect(forexNyCloseOffsetSeconds(utcSeconds(2020, 7, 28, 12))).toBe(21 * 3600)
  })

  it('uses 22h during EST (January 2020)', () => {
    expect(forexNyCloseOffsetSeconds(utcSeconds(2020, 0, 15, 12))).toBe(22 * 3600)
  })
})

describe('floorToInterval', () => {
  it('matches UTC floor when offset is 0', () => {
    const t = 1_700_000_123
    const step = 300
    expect(floorToInterval(t, step, 0)).toBe(Math.floor(t / step) * step)
  })

  it('shares a daily NY-close open across 2020-08-27 21:00 and 2020-08-28 20:59', () => {
    const offset = 21 * 3600
    const day = 86400
    const open = utcSeconds(2020, 7, 27, 21)
    const almostClose = utcSeconds(2020, 7, 28, 20, 59)
    const nextOpen = utcSeconds(2020, 7, 28, 21)
    expect(floorToInterval(open, day, offset)).toBe(open)
    expect(floorToInterval(almostClose, day, offset)).toBe(open)
    expect(floorToInterval(nextOpen, day, offset)).toBe(nextOpen)
  })
})

describe('importedForexSessionOffset', () => {
  it('returns the NY offset fn for 4h and 1d only', () => {
    expect(importedForexSessionOffset('4h')).toBe(forexNyCloseOffsetSeconds)
    expect(importedForexSessionOffset('1d')).toBe(forexNyCloseOffsetSeconds)
    expect(importedForexSessionOffset('5m')).toBeUndefined()
    expect(importedForexSessionOffset('1h')).toBeUndefined()
  })
})
