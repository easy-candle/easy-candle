import { describe, expect, it } from 'vitest'
import {
  cloneFibLevels,
  cloneDrawing,
  DEFAULT_FIB_LEVELS,
  defaultPositionLevels,
  drawingToolType,
  FIB_LEVELS,
  fibLevelsOf,
  fibPriceAtLevel,
  formatFibLevel,
  formatPriceChangePct,
  isPositionTool,
  isValidPositionLevel,
  mirrorPositionLevel,
  positionLimitPlacementBlock,
  positionLimitPlacementHint,
  positionPendingChipLabel,
  remapDrawingTimes,
  resolvedPositionLevels,
  remapDrawingTimes,
  translateDrawing,
  updateRectHandle,
  updateTwoPointEndpoint,
  type DrawingStyle,
  type FibDrawing,
  type HLineDrawing,
  type PositionDrawing,
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
const longPos: PositionDrawing = {
  id: 'd-5',
  type: 'long',
  t: 100,
  entry: 100,
  target: 110,
  stop: 90,
  span: 6
}
const shortPos: PositionDrawing = {
  id: 'd-6',
  type: 'short',
  t: 100,
  entry: 100,
  target: 90,
  stop: 110,
  span: 6
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

describe('fibLevelsOf', () => {
  const defaults = [{ ratio: 0 }, { ratio: 1 }]

  it('uses the drawing levels when present, sorted by ratio', () => {
    const drawing: FibDrawing = {
      ...fib,
      levels: [{ ratio: 1, color: '#00ff00' }, { ratio: 0 }]
    }
    expect(fibLevelsOf(drawing, defaults)).toEqual([
      { ratio: 0 },
      { ratio: 1, color: '#00ff00' }
    ])
  })

  it('falls back to the defaults when the drawing has no levels', () => {
    expect(fibLevelsOf(fib, defaults)).toEqual(defaults)
  })

  it('keeps an explicitly empty level list empty (renders no levels)', () => {
    const drawing: FibDrawing = { ...fib, levels: [] }
    expect(fibLevelsOf(drawing, defaults)).toEqual([])
  })

  it('defaults mirror the classic FIB_LEVELS ratios with no overrides', () => {
    expect(DEFAULT_FIB_LEVELS).toEqual(FIB_LEVELS.map((ratio) => ({ ratio })))
  })

  it('clones level configs deeply', () => {
    const cloned = cloneFibLevels([{ ratio: 0.5, color: '#ff0000', lineStyle: 2 }])
    expect(cloned).toEqual([{ ratio: 0.5, color: '#ff0000', lineStyle: 2 }])
    expect(cloned[0]).not.toBe(DEFAULT_FIB_LEVELS[0])
  })
})

describe('formatPriceChangePct', () => {
  it('signs long TP as profit and SL as loss', () => {
    expect(formatPriceChangePct(100, 110, 'long')).toBe('+10.00%')
    expect(formatPriceChangePct(100, 90, 'long')).toBe('-10.00%')
  })

  it('signs short TP as profit even when price falls', () => {
    expect(formatPriceChangePct(100, 90, 'short')).toBe('+10.00%')
    expect(formatPriceChangePct(100, 110, 'short')).toBe('-10.00%')
  })

  it('returns 0.00% when the level sits on entry', () => {
    expect(formatPriceChangePct(100, 100, 'long')).toBe('0.00%')
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

  it('aligns the entry time of position drawings', () => {
    expect(remapDrawingTimes(longPos, 60)).toEqual({ ...longPos, t: 60 })
  })
})

describe('position drawings', () => {
  it('detects position tools', () => {
    expect(isPositionTool('long')).toBe(true)
    expect(isPositionTool('short')).toBe(true)
    expect(isPositionTool('hline')).toBe(false)
    expect(isPositionTool('rect')).toBe(false)
  })

  it('validates levels against entry direction', () => {
    expect(isValidPositionLevel('long', 'target', 100, 110)).toBe(true)
    expect(isValidPositionLevel('long', 'target', 100, 90)).toBe(false)
    expect(isValidPositionLevel('long', 'stop', 100, 90)).toBe(true)
    expect(isValidPositionLevel('long', 'stop', 100, 110)).toBe(false)
    expect(isValidPositionLevel('short', 'target', 100, 90)).toBe(true)
    expect(isValidPositionLevel('short', 'target', 100, 110)).toBe(false)
    expect(isValidPositionLevel('short', 'stop', 100, 110)).toBe(true)
  })

  it('mirrors the opposite level at the default 1:3 R:R guide', () => {
    // Dragging the target (reward) mirrors the stop at a third of the distance.
    expect(mirrorPositionLevel('long', 100, 'target', 130)).toBe(90)
    expect(mirrorPositionLevel('short', 100, 'target', 70)).toBe(110)
    // Dragging the stop (risk) mirrors the target at triple the distance.
    expect(mirrorPositionLevel('long', 100, 'stop', 90)).toBe(130)
    expect(mirrorPositionLevel('short', 100, 'stop', 110)).toBe(70)
  })

  it('translates entry, target and stop together', () => {
    expect(translateDrawing(longPos, 5, -2)).toEqual({
      ...longPos,
      t: 105,
      entry: 98,
      target: 108,
      stop: 88
    })
    expect(translateDrawing(shortPos, -5, 3)).toEqual({
      ...shortPos,
      t: 95,
      entry: 103,
      target: 93,
      stop: 113
    })
  })

  it('keeps null levels null when translating', () => {
    const bare: PositionDrawing = { id: 'd-7', type: 'short', t: 10, entry: 50, target: null, stop: null, span: 3 }
    expect(translateDrawing(bare, 2, 1)).toEqual({ ...bare, t: 12, entry: 51 })
  })

  it('blocks placing a limit when TP or SL cannot be resolved', () => {
    const ready = { hasMark: true }
    const unset: Pick<PositionDrawing, 'type' | 'entry' | 'target' | 'stop'> = {
      type: 'long',
      entry: 100,
      target: null,
      stop: null
    }
    expect(positionLimitPlacementBlock(unset, ready)).toBe('missing-levels')
    expect(positionLimitPlacementHint('missing-levels', 'long')).toMatch(/drag the TP and SL handles/i)
    expect(positionLimitPlacementBlock({ ...unset, stop: 90 }, ready)).toBe('missing-tp')
    expect(positionLimitPlacementHint('missing-tp', 'long')).toMatch(/take profit is not set/i)
    expect(positionLimitPlacementBlock({ ...unset, target: 110 }, ready)).toBe('missing-sl')
    expect(positionLimitPlacementHint('missing-sl', 'short')).toMatch(/stop loss is not set/i)
    expect(
      positionLimitPlacementBlock({ type: 'long', entry: 100, target: 110, stop: 90 }, ready)
    ).toBe(null)
    expect(
      positionLimitPlacementBlock(
        { type: 'long', entry: 100, target: 110, stop: 90 },
        { ...ready, markPrice: 100 }
      )
    ).toBe('at-mark')
    expect(
      positionLimitPlacementBlock(
        { type: 'long', entry: 105, target: 115, stop: 95 },
        { ...ready, markPrice: 100 }
      )
    ).toBe(null)
    expect(positionLimitPlacementHint(null, 'long')).toMatch(/buy limit/i)
    expect(positionLimitPlacementHint(null, 'long', 'stopLimit')).toMatch(/buy stop limit/i)
    expect(positionLimitPlacementHint(null, 'short', 'stopLimit')).toMatch(/sell stop limit/i)
    expect(positionLimitPlacementHint('at-mark', 'long')).toMatch(/at the current price/i)
    expect(positionPendingChipLabel('long', 'limit')).toBe('Place Buy Limit')
    expect(positionPendingChipLabel('long', 'stopLimit')).toBe('Place Buy Stop Limit')
    expect(positionPendingChipLabel('short', 'stopLimit')).toBe('Place Sell Stop Limit')
  })

  it('uses the painted 1:3 guide when TP/SL are still null on a fresh drawing', () => {
    const range = { from: 0, to: 100 }
    const unset = { type: 'long' as const, entry: 50, target: null, stop: null }
    expect(defaultPositionLevels('long', 50, range)).toEqual({ target: 65, stop: 45 })
    expect(defaultPositionLevels('short', 50, range)).toEqual({ target: 35, stop: 55 })
    expect(defaultPositionLevels('long', 50, { from: 10, to: 10 })).toBe(null)
    expect(resolvedPositionLevels(unset, range)).toEqual({ target: 65, stop: 45 })
    expect(
      resolvedPositionLevels({ ...unset, target: 80 }, range)
    ).toEqual({ target: 80, stop: 45 })
    expect(
      positionLimitPlacementBlock(unset, {
        hasMark: true,
        visibleRange: range
      })
    ).toBe(null)
  })

  it('blocks placing a limit when mark is missing or a level is invalid', () => {
    const drawing = { type: 'long' as const, entry: 100, target: 110, stop: 90 }
    expect(
      positionLimitPlacementBlock(drawing, { hasMark: false })
    ).toBe('no-mark')
    expect(
      positionLimitPlacementBlock(
        { ...drawing, target: 90 },
        { hasMark: true }
      )
    ).toBe('invalid-tp')
    expect(
      positionLimitPlacementBlock(
        { ...drawing, stop: 110 },
        { hasMark: true }
      )
    ).toBe('invalid-sl')
  })

  it('clones position drawings with a new id', () => {
    const copy = cloneDrawing(longPos, 'd-99')
    expect(copy.id).toBe('d-99')
    expect(copy).toMatchObject({
      type: 'long',
      t: 100,
      entry: 100,
      target: 110,
      stop: 90
    })
    expect(longPos.id).toBe('d-5')
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

describe('drawing styles', () => {
  const style: DrawingStyle = { color: '#10B981', lineWidth: 3, lineStyle: 2 }
  const styled: HLineDrawing = { id: 'd-9', type: 'hline', price: 50, style }

  it('maps every drawing to its settings key', () => {
    expect(drawingToolType(hline)).toBe('hline')
    expect(drawingToolType(trend)).toBe('trendline')
    expect(drawingToolType(fib)).toBe('fib')
    expect(drawingToolType(rect)).toBe('rect')
    expect(drawingToolType(longPos)).toBe('long')
    expect(drawingToolType(shortPos)).toBe('short')
  })

  it('survives clone, translate and remap untouched', () => {
    const copied = cloneDrawing(styled, 'd-10')
    expect(copied).toMatchObject({ id: 'd-10', style })
    expect(translateDrawing(styled, 5, 2)).toMatchObject({ price: 52, style })
    expect(remapDrawingTimes(styled, (t) => t * 2)).toMatchObject({ style })
  })
})
