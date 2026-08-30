import { describe, expect, it } from 'vitest'
import type { ClosedTrade } from '@/lib/paperTrade'
import {
  buildEquityCurve,
  curveAreaPath,
  curveExtent,
  curvePolyline,
  projectPoint,
  valueTicks,
  type PlotBox
} from './equityCurve'

function trade(partial: Partial<ClosedTrade> & { pnl: number; exitTime: number }): ClosedTrade {
  return {
    id: `t-${partial.exitTime}`,
    side: 'long',
    entryPrice: 100,
    entryTime: partial.exitTime - 60,
    exitPrice: 101,
    lots: 1,
    exitReason: 'manual',
    takeProfit: null,
    stopLoss: null,
    ...partial
  }
}

const BOX: PlotBox = {
  width: 120,
  height: 60,
  padding: { top: 10, right: 10, bottom: 10, left: 20 }
}

describe('buildEquityCurve', () => {
  it('accumulates realized PnL from a zero baseline', () => {
    const curve = buildEquityCurve([
      trade({ pnl: 10, exitTime: 200, entryTime: 100 }),
      trade({ pnl: -4, exitTime: 300 }),
      trade({ pnl: 6, exitTime: 400 })
    ])

    expect(curve).toEqual([
      { time: 100, value: 0, tradeCount: 0 },
      { time: 200, value: 10, tradeCount: 1 },
      { time: 300, value: 6, tradeCount: 2 },
      { time: 400, value: 12, tradeCount: 3 }
    ])
  })

  it('anchors the baseline at the earliest entry, not the first exit', () => {
    const curve = buildEquityCurve([
      trade({ pnl: 5, exitTime: 500, entryTime: 400 }),
      // Opened before the first trade but closed after it.
      trade({ pnl: 5, exitTime: 600, entryTime: 50 })
    ])
    expect(curve[0].time).toBe(50)
  })

  it('sorts by exit time, so out-of-order closes still run forward', () => {
    const curve = buildEquityCurve([
      trade({ pnl: 3, exitTime: 900 }),
      trade({ pnl: -1, exitTime: 300 })
    ])
    expect(curve.map((p) => p.time)).toEqual([240, 300, 900])
    expect(curve.map((p) => p.value)).toEqual([0, -1, 2])
  })

  it('is empty without trades', () => {
    expect(buildEquityCurve([])).toEqual([])
  })

  it('skips trades with a non-numeric exit time or pnl', () => {
    const curve = buildEquityCurve([
      trade({ pnl: 5, exitTime: 200 }),
      trade({ pnl: NaN, exitTime: 300 }),
      { ...trade({ pnl: 1, exitTime: 400 }), exitTime: NaN }
    ])
    expect(curve).toHaveLength(2)
    expect(curve[1].value).toBe(5)
  })
})

describe('curveExtent', () => {
  it('always spans zero so the baseline stays visible', () => {
    const extent = curveExtent(buildEquityCurve([trade({ pnl: 10, exitTime: 200 })]))
    expect(extent?.minValue).toBe(0)
    expect(extent?.maxValue).toBe(10)
  })

  it('includes zero when the curve is entirely negative', () => {
    const extent = curveExtent(buildEquityCurve([trade({ pnl: -8, exitTime: 200 })]))
    expect(extent?.minValue).toBe(-8)
    expect(extent?.maxValue).toBe(0)
  })

  it('pads a flat curve so it does not collapse', () => {
    const extent = curveExtent([{ time: 100, value: 0, tradeCount: 0 }])
    expect(extent).toEqual({ minTime: 100, maxTime: 101, minValue: -1, maxValue: 1 })
  })

  it('is null for an empty curve', () => {
    expect(curveExtent([])).toBeNull()
  })
})

describe('projectPoint', () => {
  const extent = { minTime: 0, maxTime: 100, minValue: -10, maxValue: 10 }

  it('puts the first point at the left padding', () => {
    expect(projectPoint({ time: 0, value: 0, tradeCount: 0 }, extent, BOX).x).toBe(20)
  })

  it('puts the last point at the right edge of the plot', () => {
    expect(projectPoint({ time: 100, value: 0, tradeCount: 0 }, extent, BOX).x).toBe(110)
  })

  it('inverts the value axis, so the maximum sits at the top', () => {
    const top = projectPoint({ time: 0, value: 10, tradeCount: 0 }, extent, BOX)
    const bottom = projectPoint({ time: 0, value: -10, tradeCount: 0 }, extent, BOX)
    expect(top.y).toBe(10)
    expect(bottom.y).toBe(50)
    expect(top.y).toBeLessThan(bottom.y)
  })

  it('places zero midway when the range is symmetric', () => {
    expect(projectPoint({ time: 0, value: 0, tradeCount: 0 }, extent, BOX).y).toBe(30)
  })
})

describe('curvePolyline', () => {
  it('emits one coordinate pair per point', () => {
    const curve = buildEquityCurve([
      trade({ pnl: 5, exitTime: 200, entryTime: 100 }),
      trade({ pnl: 5, exitTime: 300 })
    ])
    const extent = curveExtent(curve)!
    const pairs = curvePolyline(curve, extent, BOX).split(' ')
    expect(pairs).toHaveLength(3)
    expect(pairs[0]).toMatch(/^\d+\.\d{2},\d+\.\d{2}$/)
  })
})

describe('curveAreaPath', () => {
  it('closes the path back to the baseline', () => {
    const curve = buildEquityCurve([trade({ pnl: 5, exitTime: 200, entryTime: 100 })])
    const extent = curveExtent(curve)!
    const path = curveAreaPath(curve, extent, BOX)
    expect(path.startsWith('M ')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
  })

  it('is empty without points', () => {
    expect(curveAreaPath([], { minTime: 0, maxTime: 1, minValue: 0, maxValue: 1 }, BOX)).toBe('')
  })
})

describe('valueTicks', () => {
  it('labels min, zero and max when the curve crosses zero', () => {
    expect(valueTicks({ minTime: 0, maxTime: 1, minValue: -5, maxValue: 10 })).toEqual([10, 0, -5])
  })

  it('uses a midpoint when the curve never crosses zero', () => {
    expect(valueTicks({ minTime: 0, maxTime: 1, minValue: 0, maxValue: 10 })).toEqual([10, 5, 0])
  })

  it('is sorted high to low, matching the drawn order', () => {
    const ticks = valueTicks({ minTime: 0, maxTime: 1, minValue: -8, maxValue: 4 })
    expect([...ticks].sort((a, b) => b - a)).toEqual(ticks)
  })
})
