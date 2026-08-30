import { describe, expect, it } from 'vitest'
import {
  focusHistoryRange,
  forwardRange,
  historyRange,
  IMPORT_FOCUS_MAX_BARS,
  IMPORT_HISTORY_PAGE_BARS,
  IMPORT_LIVE_WINDOW_BARS,
  IMPORT_PREFETCH_BATCH_BARS,
  IMPORT_REPLAY_FORWARD_BARS,
  IMPORT_REPLAY_LOOKBACK_BARS,
  mergeLoadedWindow,
  replayRange,
  tailRange
} from './importWindow'

describe('tailRange', () => {
  it('defaults to the live window size', () => {
    expect(tailRange()).toEqual({ limit: IMPORT_LIVE_WINDOW_BARS })
  })

  it('falls back to the default for invalid limits', () => {
    expect(tailRange(0)).toEqual({ limit: IMPORT_LIVE_WINDOW_BARS })
    expect(tailRange(-10)).toEqual({ limit: IMPORT_LIVE_WINDOW_BARS })
  })
})

describe('historyRange', () => {
  it('ends one second before the oldest loaded candle', () => {
    expect(historyRange(1_000_000)).toEqual({
      endTime: 999_999,
      limit: IMPORT_HISTORY_PAGE_BARS
    })
  })

  it('honours an explicit limit', () => {
    expect(historyRange(500, 25)).toEqual({ endTime: 499, limit: 25 })
  })
})

describe('forwardRange', () => {
  it('starts one second after the newest loaded candle', () => {
    expect(forwardRange(1_000_000)).toEqual({
      startTime: 1_000_001,
      limit: IMPORT_PREFETCH_BATCH_BARS
    })
  })
})

describe('replayRange', () => {
  it('anchors on the lookback start and covers lookback + forward bars', () => {
    const start = 1_000_000
    const interval = 900
    expect(replayRange(start, interval)).toEqual({
      startTime: start - IMPORT_REPLAY_LOOKBACK_BARS * interval,
      limit: IMPORT_REPLAY_LOOKBACK_BARS + IMPORT_REPLAY_FORWARD_BARS
    })
  })

  it('supports a zero lookback', () => {
    expect(replayRange(5000, 60, { lookbackBars: 0, forwardBars: 10 })).toEqual({
      startTime: 5000,
      limit: 10
    })
  })

  it('never asks for a negative start time', () => {
    expect(replayRange(60, 60, { lookbackBars: 100, forwardBars: 5 }).startTime).toBe(0)
  })
})

describe('focusHistoryRange', () => {
  it('spans the target minus lookback up to just before the oldest loaded bar', () => {
    expect(focusHistoryRange(1000, 5000, 60, { lookbackBars: 10 })).toEqual({
      startTime: 400,
      endTime: 4999,
      limit: IMPORT_FOCUS_MAX_BARS
    })
  })

  it('defaults to no lookback and the focus ceiling', () => {
    expect(focusHistoryRange(1000, 5000, 60)).toEqual({
      startTime: 1000,
      endTime: 4999,
      limit: IMPORT_FOCUS_MAX_BARS
    })
  })

  it('never asks for a negative start time', () => {
    expect(focusHistoryRange(60, 5000, 60, { lookbackBars: 100 }).startTime).toBe(0)
  })

  it('honours an explicit limit', () => {
    expect(focusHistoryRange(1000, 5000, 60, { limit: 50 }).limit).toBe(50)
  })
})

describe('mergeLoadedWindow', () => {
  const base = {
    loadedFrom: 500,
    loadedTo: 900,
    hasMoreBefore: true,
    hasMoreAfter: true,
    totalCount: 100
  }

  it('returns the incoming window when there is no previous one', () => {
    expect(mergeLoadedWindow(null, base)).toEqual(base)
  })

  it('takes hasMoreBefore from the older page', () => {
    const older = {
      loadedFrom: 100,
      loadedTo: 499,
      hasMoreBefore: false,
      hasMoreAfter: true,
      totalCount: 100
    }
    expect(mergeLoadedWindow(base, older)).toEqual({
      loadedFrom: 100,
      loadedTo: 900,
      hasMoreBefore: false,
      hasMoreAfter: true,
      totalCount: 100
    })
  })

  it('takes hasMoreAfter from the newer page', () => {
    const newer = {
      loadedFrom: 901,
      loadedTo: 1500,
      hasMoreBefore: true,
      hasMoreAfter: false,
      totalCount: 100
    }
    expect(mergeLoadedWindow(base, newer)).toEqual({
      loadedFrom: 500,
      loadedTo: 1500,
      hasMoreBefore: true,
      hasMoreAfter: false,
      totalCount: 100
    })
  })

  it('keeps the previous window when the incoming one is empty', () => {
    const empty = {
      loadedFrom: 0,
      loadedTo: 0,
      hasMoreBefore: true,
      hasMoreAfter: false,
      totalCount: 100
    }
    expect(mergeLoadedWindow(base, empty)).toEqual(base)
  })
})
