import { describe, expect, it } from 'vitest'
import {
  alignTimeToInterval,
  coarserTouchedCover,
  defaultSecondaryTimeframe,
  followerPlayheadCover,
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

describe('followerPlayheadCover', () => {
  it('reveals every finer follower bar covered by a coarser driver', () => {
    const fiveOpen = alignTimeToInterval(1_700_000_000, TIMEFRAMES['5m'].seconds)
    expect(
      followerPlayheadCover(fiveOpen, TIMEFRAMES['5m'].seconds, TIMEFRAMES['1m'].seconds)
    ).toBe(playheadCoverEnd(fiveOpen, TIMEFRAMES['5m'].seconds))
  })

  it('reveals a coarser follower as soon as any finer bar of that period plays', () => {
    const hourOpen = alignTimeToInterval(1_700_000_000, TIMEFRAMES['1h'].seconds)
    const firstFive = hourOpen
    const midFive = hourOpen + TIMEFRAMES['5m'].seconds * 6
    const lastFive = hourOpen + TIMEFRAMES['5m'].seconds * 11
    const hourEnd = playheadCoverEnd(hourOpen, TIMEFRAMES['1h'].seconds)

    expect(
      followerPlayheadCover(firstFive, TIMEFRAMES['5m'].seconds, TIMEFRAMES['1h'].seconds)
    ).toBe(hourEnd)
    expect(
      followerPlayheadCover(midFive, TIMEFRAMES['5m'].seconds, TIMEFRAMES['1h'].seconds)
    ).toBe(hourEnd)
    expect(
      followerPlayheadCover(lastFive, TIMEFRAMES['5m'].seconds, TIMEFRAMES['1h'].seconds)
    ).toBe(hourEnd)
  })

  it('reveals the coarser bar that contains a mid-period touch', () => {
    const hourOpen = alignTimeToInterval(1_700_000_000, TIMEFRAMES['1h'].seconds)
    const midFive = hourOpen + TIMEFRAMES['5m'].seconds * 4
    expect(coarserTouchedCover(midFive, TIMEFRAMES['1h'].seconds)).toBe(
      playheadCoverEnd(hourOpen, TIMEFRAMES['1h'].seconds)
    )
  })

  it('reveals a 15m follower on the first 5m bar of that period', () => {
    const fifteenOpen = alignTimeToInterval(1_700_000_000, TIMEFRAMES['15m'].seconds)
    const firstFive = fifteenOpen
    const lastFive = fifteenOpen + TIMEFRAMES['5m'].seconds * 2
    const fifteenEnd = playheadCoverEnd(fifteenOpen, TIMEFRAMES['15m'].seconds)

    expect(
      followerPlayheadCover(firstFive, TIMEFRAMES['5m'].seconds, TIMEFRAMES['15m'].seconds)
    ).toBe(fifteenEnd)
    expect(
      followerPlayheadCover(lastFive, TIMEFRAMES['5m'].seconds, TIMEFRAMES['15m'].seconds)
    ).toBe(fifteenEnd)
  })
})

describe('defaultSecondaryTimeframe', () => {
  it('pairs 1m with 5m and other TFs with 1m', () => {
    expect(defaultSecondaryTimeframe('1m')).toBe('5m')
    expect(defaultSecondaryTimeframe('15m')).toBe('1m')
  })
})
