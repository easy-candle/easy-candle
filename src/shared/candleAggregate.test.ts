import { describe, expect, it } from 'vitest'
import {
  aggregateCandles,
  buildImportTimeframes,
  buildImportTimeframesAsync,
  formingHigherTfCandle,
  overlayFormingHigherTf,
  IMPORT_DERIVED_TIMEFRAMES
} from './candleAggregate'
import type { Candle } from './candleUtils'
import { forexNyCloseOffsetSeconds } from './forexSession'
import { hasNewerCandles } from './importTypes'
import { TIMEFRAMES } from './timeframes'

function utcSeconds(year: number, month: number, day: number, hour: number, minute = 0): number {
  return Date.UTC(year, month, day, hour, minute, 0) / 1000
}

function series(count: number, stepSec: number, start = 1_700_000_000): Candle[] {
  const out: Candle[] = []
  for (let i = 0; i < count; i += 1) {
    const open = 100 + i
    out.push({
      time: start + i * stepSec,
      open,
      high: open + 1,
      low: open - 1,
      close: open + 0.5,
      volume: 2
    })
  }
  return out
}

describe('aggregateCandles', () => {
  it('aggregates 1m into 5m OHLC', () => {
    const start = 1_700_000_100 // divisible by 300
    expect(start % 300).toBe(0)
    const candles = series(10, 60, start)
    const agg = aggregateCandles(candles, 300)
    expect(agg).toHaveLength(2)
    expect(agg[0]).toMatchObject({
      time: start,
      open: 100,
      high: 105,
      low: 99,
      close: 104.5,
      volume: 10
    })
    expect(agg[1].time).toBe(start + 300)
  })

  it('floors open times onto the interval grid', () => {
    const bucket = 1_700_000_100
    expect(bucket % 300).toBe(0)
    const candles = series(5, 60, bucket + 90)
    const agg = aggregateCandles(candles, 300)
    expect(agg[0].time).toBe(bucket)
  })

  it('matches the UTC floor when sessionOffset is 0', () => {
    const start = 1_700_000_100
    const candles = series(10, 60, start)
    expect(aggregateCandles(candles, 300, undefined, 0)).toEqual(aggregateCandles(candles, 300))
  })

  it('buckets Aug 2020 4h/1d onto the NY-close session', () => {
    const sessionOpen = utcSeconds(2020, 7, 27, 21)
    const almostClose = utcSeconds(2020, 7, 28, 20, 59)
    const nextOpen = utcSeconds(2020, 7, 28, 21)
    const candles = [
      { time: sessionOpen, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      { time: almostClose, open: 2, high: 2, low: 2, close: 2, volume: 1 },
      { time: nextOpen, open: 3, high: 3, low: 3, close: 3, volume: 1 }
    ]
    const daily = aggregateCandles(
      candles,
      TIMEFRAMES['1d'].seconds,
      undefined,
      forexNyCloseOffsetSeconds
    )
    expect(daily.map((c) => c.time)).toEqual([sessionOpen, nextOpen])
    expect(daily[0]).toMatchObject({ open: 1, high: 2, low: 1, close: 2 })

    const fourHour = aggregateCandles(
      candles,
      TIMEFRAMES['4h'].seconds,
      undefined,
      forexNyCloseOffsetSeconds
    )
    expect(fourHour[0].time).toBe(sessionOpen)
    expect(fourHour[fourHour.length - 1].time).toBe(nextOpen)
    expect(aggregateCandles(candles, TIMEFRAMES['4h'].seconds)[0].time).toBe(
      utcSeconds(2020, 7, 27, 20)
    )
  })
})

describe('buildImportTimeframes', () => {
  it('builds all derived timeframes from 1m', () => {
    const candles1m = series(60 * 24, 60, 0)
    const map = buildImportTimeframes(candles1m)
    expect(map['1m']).toHaveLength(60 * 24)
    expect(map['5m']?.length).toBe(12 * 24)
    expect(map['15m']?.length).toBe(4 * 24)
    expect(map['1h']?.length).toBe(24)
    expect(map['4h']?.length).toBe(6)
    expect(map['1d']?.length).toBe(1)
  })

  it('buildImportTimeframesAsync matches the sync builder', async () => {
    const candles1m = series(60 * 24, 60, 0)
    const phases: string[] = []
    const asyncMap = await buildImportTimeframesAsync(candles1m, (progress) => {
      phases.push(progress.phase)
    })
    expect(asyncMap).toEqual(buildImportTimeframes(candles1m))
    expect(phases.length).toBeGreaterThan(0)
    expect(phases[phases.length - 1]).toBe('Timeframes ready')
  })

  it('reports UI-mapped percents ending at 63', async () => {
    const candles1m = series(60 * 24, 60, 0)
    const percents: number[] = []
    await buildImportTimeframesAsync(candles1m, (progress) => {
      percents.push(progress.percent)
    })
    expect(percents[0]).toBe(0)
    expect(percents).toContain(55)
    expect(percents).toContain(57)
    expect(percents).toContain(59)
    expect(percents).toContain(61)
    expect(percents[percents.length - 1]).toBe(63)
  })

  it('cascade matches aggregating every TF from 1m, including gaps', () => {
    const start = 1_700_000_100
    expect(start % 300).toBe(0)
    const candles1m = [...series(7, 60, start), ...series(23, 60, start + 3600)]
    const cascaded = buildImportTimeframes(candles1m)
    for (const id of IMPORT_DERIVED_TIMEFRAMES) {
      const direct = aggregateCandles(candles1m, TIMEFRAMES[id].seconds)
      expect(cascaded[id]).toEqual(direct)
    }
  })

  it('keeps 5m on the UTC 300s grid when a session offset is passed', () => {
    const start = utcSeconds(2020, 7, 27, 21)
    const candles1m = series(60, 60, start)
    const map = buildImportTimeframes(candles1m, forexNyCloseOffsetSeconds)
    expect(map['5m']).toEqual(aggregateCandles(candles1m, TIMEFRAMES['5m'].seconds))
    expect(map['5m'].every((c) => c.time % 300 === 0)).toBe(true)
    expect(map['15m']).toEqual(aggregateCandles(candles1m, TIMEFRAMES['15m'].seconds))
    expect(map['1h']).toEqual(aggregateCandles(candles1m, TIMEFRAMES['1h'].seconds))
    expect(map['4h']).toEqual(
      aggregateCandles(candles1m, TIMEFRAMES['4h'].seconds, undefined, forexNyCloseOffsetSeconds)
    )
    expect(map['1d']).toEqual(
      aggregateCandles(candles1m, TIMEFRAMES['1d'].seconds, undefined, forexNyCloseOffsetSeconds)
    )
    expect(map['4h'][0].time).toBe(start)
    expect(map['1d'][0].time).toBe(start)
  })
})

describe('hasNewerCandles', () => {
  it('detects newer last open time', () => {
    const existing = series(5, 60)
    const incoming = series(6, 60)
    expect(hasNewerCandles(existing, incoming)).toBe(true)
    expect(hasNewerCandles(incoming, existing)).toBe(false)
    expect(hasNewerCandles(existing, existing)).toBe(false)
  })
})

describe('formingHigherTfCandle', () => {
  it('builds a live 1h candle from 5m bars played so far', () => {
    const hour = 1_699_999_200
    expect(hour % 3600).toBe(0)
    const fives = series(12, 300, hour)
    const mid = fives.slice(0, 3)
    const forming = formingHigherTfCandle(mid, 3600)
    expect(forming).toMatchObject({
      time: hour,
      open: 100,
      high: 103,
      low: 99,
      close: 102.5,
      volume: 6
    })
    expect(formingHigherTfCandle(fives, 3600)).toMatchObject({
      time: hour,
      open: 100,
      high: 112,
      low: 99,
      close: 111.5,
      volume: 24
    })
  })

  it('does not include finer bars from the next higher-TF period', () => {
    const hour = 1_699_999_200
    const fives = series(13, 300, hour)
    const forming = formingHigherTfCandle(fives.slice(0, 13), 3600)
    expect(forming?.time).toBe(hour + 3600)
    expect(forming?.open).toBe(112)
  })
})

describe('overlayFormingHigherTf', () => {
  it('replaces the current coarser bar without leaking completed OHLC', () => {
    const hour = 1_699_999_200
    const fives = series(12, 300, hour)
    const completed = aggregateCandles(fives, 3600)
    const forming = overlayFormingHigherTf(completed, fives.slice(0, 2), 3600)
    expect(forming).toHaveLength(1)
    expect(forming[0]).toMatchObject({
      time: hour,
      open: 100,
      high: 102,
      low: 99,
      close: 101.5
    })
    expect(completed[0].close).toBe(111.5)
  })
})
