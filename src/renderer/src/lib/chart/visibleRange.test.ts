import { describe, expect, it } from 'vitest'
import type { Candle } from '@shared/candleUtils'
import { describeVisibleRange, historyEdgeKey } from './visibleRange'

function candle(time: number): Candle {
  return { time, open: 1, high: 1, low: 1, close: 1, volume: 0 }
}

const INTERVAL = 60
/** 1000 … 1540 (10 bars). */
const BARS = Array.from({ length: 10 }, (_, i) => candle(1000 + i * INTERVAL))

describe('describeVisibleRange', () => {
  it('returns null for a null range or a non-numeric payload', () => {
    expect(describeVisibleRange(null, BARS, INTERVAL)).toBeNull()
    expect(describeVisibleRange({ from: NaN, to: 5 } as never, BARS, INTERVAL)).toBeNull()
  })

  it('maps the viewport edges back to UTC seconds', () => {
    const info = describeVisibleRange({ from: 2, to: 5 } as never, BARS, INTERVAL, 0)
    expect(info?.fromTime).toBe(1120)
    expect(info?.toTime).toBe(1300)
    expect(info?.barsBefore).toBe(0)
    expect(info?.barsAfter).toBe(0)
  })

  it('counts empty slots past either end of the series', () => {
    const info = describeVisibleRange({ from: -4, to: 13 } as never, BARS, INTERVAL, 0)
    expect(info?.barsBefore).toBe(4)
    expect(info?.barsAfter).toBe(4)
    expect(info?.fromTime).toBe(1000 - 4 * INTERVAL)
    expect(info?.toTime).toBe(1540 + 4 * INTERVAL)
  })

  it('flags the history edge within the threshold, not only at index 0', () => {
    const far = describeVisibleRange({ from: 8, to: 12 } as never, BARS, INTERVAL, 2)
    const near = describeVisibleRange({ from: 2, to: 6 } as never, BARS, INTERVAL, 2)
    const before = describeVisibleRange({ from: -3, to: 2 } as never, BARS, INTERVAL, 2)
    expect(far?.atStart).toBe(false)
    expect(near?.atStart).toBe(true)
    expect(before?.atStart).toBe(true)
  })

  it('flags the newest edge within the threshold', () => {
    expect(describeVisibleRange({ from: 0, to: 4 } as never, BARS, INTERVAL, 2)?.atEnd).toBe(false)
    expect(describeVisibleRange({ from: 3, to: 7 } as never, BARS, INTERVAL, 2)?.atEnd).toBe(true)
    expect(describeVisibleRange({ from: 6, to: 14 } as never, BARS, INTERVAL, 2)?.atEnd).toBe(true)
  })

  it('never reports an edge for an empty series', () => {
    const info = describeVisibleRange({ from: 0, to: 5 } as never, [], INTERVAL)
    expect(info?.atStart).toBe(false)
    expect(info?.atEnd).toBe(false)
    expect(info?.fromTime).toBeNull()
  })
})

describe('historyEdgeKey', () => {
  it('is stable while the loaded series is unchanged', () => {
    const info = describeVisibleRange({ from: 1, to: 6 } as never, BARS, INTERVAL, 2)
    expect(historyEdgeKey(info, BARS)).toBe('10:1000')
    expect(historyEdgeKey(info, BARS)).toBe(historyEdgeKey(info, BARS))
  })

  it('changes once older candles are prepended', () => {
    const info = describeVisibleRange({ from: 1, to: 6 } as never, BARS, INTERVAL, 2)
    const extended = [candle(940), ...BARS]
    expect(historyEdgeKey(info, extended)).toBe('11:940')
  })

  it('is null away from the history edge or without candles', () => {
    const away = describeVisibleRange({ from: 6, to: 9 } as never, BARS, INTERVAL, 2)
    expect(historyEdgeKey(away, BARS)).toBeNull()
    expect(historyEdgeKey(null, BARS)).toBeNull()
    expect(
      historyEdgeKey(describeVisibleRange({ from: 0, to: 1 } as never, [], INTERVAL), [])
    ).toBeNull()
  })
})
