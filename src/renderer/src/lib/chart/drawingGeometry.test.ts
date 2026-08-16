import { describe, expect, it } from 'vitest'
import {
  cloneDrawing,
  FIB_LEVELS,
  fibPriceAtLevel,
  formatFibLevel,
  remapDrawingTimes,
  translateDrawing,
  updateRectHandle,
  updateTwoPointEndpoint,
  type FibDrawing,
  type HLineDrawing,
  type RectDrawing,
  type TrendDrawing
} from './drawingGeometry'

const hline: HLineDrawing = { id: 'd-1', type: 'hline', price: 100 }
const trend: TrendDrawing = {
  id: 'd-2',
  type: 'trendline',
  t1: 90,
  p1: 100,
  t2: 150,
  p2: 200
}
const fib: FibDrawing = {
  id: 'd-3',
  type: 'fib',
  t1: 1_000,
  p1: 100,
  t2: 1_060,
  p2: 200
}
const rect: RectDrawing = {
  id: 'd-4',
  type: 'rect',
  t1: 10,
  p1: 120,
  t2: 40,
  p2: 80
}

describe('fibPriceAtLevel', () => {
  it('uses MetaTrader default ratios from first click (0) to second (1)', () => {
    expect(FIB_LEVELS).toEqual([0, 0.236, 0.382, 0.5, 0.618, 1])
    expect(fibPriceAtLevel(100, 200, 0)).toBe(100)
    expect(fibPriceAtLevel(100, 200, 1)).toBe(200)
    expect(fibPriceAtLevel(100, 200, 0.5)).toBe(150)
    expect(fibPriceAtLevel(100, 200, 0.618)).toBeCloseTo(161.8)
    expect(fibPriceAtLevel(100, 200, 0.236)).toBeCloseTo(123.6)
  })

  it('formats default level labels', () => {
    expect(FIB_LEVELS.map(formatFibLevel)).toEqual([
      '0.0',
      '0.236',
      '0.382',
      '0.5',
      '0.618',
      '1.0'
    ])
  })
})

describe('cloneDrawing', () => {
  it('copies geometry and assigns a new id', () => {
    const copy = cloneDrawing(trend, 'd-99')
    expect(copy.id).toBe('d-99')
    expect(copy).toMatchObject({
      type: 'trendline',
      t1: trend.t1,
      p1: trend.p1,
      t2: trend.t2,
      p2: trend.p2
    })
    expect(trend.id).toBe('d-2')
  })
})

describe('translateDrawing', () => {
  it('shifts only price on a horizontal line', () => {
    expect(translateDrawing(hline, 999, -5)).toEqual({ id: 'd-1', type: 'hline', price: 95 })
  })

  it('shifts both anchors on two-point drawings', () => {
    expect(translateDrawing(fib, 10, -4)).toEqual({
      id: 'd-3',
      type: 'fib',
      t1: 1_010,
      p1: 96,
      t2: 1_070,
      p2: 196
    })
    expect(translateDrawing(rect, -5, 2)).toEqual({
      id: 'd-4',
      type: 'rect',
      t1: 5,
      p1: 122,
      t2: 35,
      p2: 82
    })
  })
})

describe('remapDrawingTimes', () => {
  it('leaves horizontal lines unchanged', () => {
    expect(remapDrawingTimes(hline, 60)).toBe(hline)
  })

  it('aligns two-point times onto the candle open grid', () => {
    expect(remapDrawingTimes(trend, 60)).toEqual({
      ...trend,
      t1: 60,
      t2: 120
    })
  })
})

describe('updateTwoPointEndpoint', () => {
  it('replaces start or end without touching the other', () => {
    expect(
      updateTwoPointEndpoint(trend, 'start', { time: 50, price: 1 })
    ).toMatchObject({ t1: 50, p1: 1, t2: trend.t2, p2: trend.p2 })
    expect(
      updateTwoPointEndpoint(fib, 'end', { time: 80, price: 9 })
    ).toMatchObject({ t1: fib.t1, p1: fib.p1, t2: 80, p2: 9 })
  })
})

describe('updateRectHandle', () => {
  it('moves the north-west corner independently', () => {
    expect(updateRectHandle(rect, 'nw', { time: 5, price: 130 })).toEqual({
      id: 'd-4',
      type: 'rect',
      t1: 5,
      t2: 40,
      p1: 130,
      p2: 80
    })
  })
})
