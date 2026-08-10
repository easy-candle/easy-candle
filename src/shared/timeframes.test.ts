import { describe, expect, it } from 'vitest'
import {
  alignTimeToInterval,
  defaultSecondaryTimeframe,
  playheadCoverEnd,
  TIMEFRAMES
} from './timeframes'

describe('playheadCoverEnd', () => {
  it('covers five 1m opens inside one 5m candle', () => {
    const open = alignTimeToInterval(1_700_000_000, TIMEFRAMES['5m'].seconds)
    const cover = playheadCoverEnd(open, TIMEFRAMES['5m'].seconds)
    const first = alignTimeToInterval(open, 60)
    const last = alignTimeToInterval(cover, 60)
    expect((last - first) / 60 + 1).toBe(5)
  })

  it('keeps a coarser follower on the same bar while finer TF steps inside it', () => {
    const fiveOpen = alignTimeToInterval(1_700_000_000, TIMEFRAMES['5m'].seconds)
    const oneOpen = fiveOpen + 60 * 2
    const cover = playheadCoverEnd(oneOpen, TIMEFRAMES['1m'].seconds)
    expect(alignTimeToInterval(cover, TIMEFRAMES['5m'].seconds)).toBe(fiveOpen)
  })
})

describe('defaultSecondaryTimeframe', () => {
  it('pairs 1m with 5m and other TFs with 1m', () => {
    expect(defaultSecondaryTimeframe('1m')).toBe('5m')
    expect(defaultSecondaryTimeframe('15m')).toBe('1m')
  })
})
