import { describe, expect, it } from 'vitest'
import {
  clampXToPlot,
  fibLabelPlacement,
  fibLevelExtent,
  isInPlotX,
  plotRightX
} from './drawingPlotBounds'

describe('plotRightX', () => {
  it('prefers the time-scale width when present', () => {
    expect(plotRightX(800, 72, 728)).toBe(728)
  })

  it('falls back to chart width minus the price scale', () => {
    expect(plotRightX(800, 72, 0)).toBe(728)
    expect(plotRightX(800, 72)).toBe(728)
  })

  it('never goes negative', () => {
    expect(plotRightX(40, 72)).toBe(0)
    expect(plotRightX(0, 56)).toBe(0)
  })
})

describe('isInPlotX / clampXToPlot', () => {
  it('treats the plot-right edge as inside, and the price scale as outside', () => {
    expect(isInPlotX(0, 700)).toBe(true)
    expect(isInPlotX(700, 700)).toBe(true)
    expect(isInPlotX(701, 700)).toBe(false)
    expect(isInPlotX(-1, 700)).toBe(false)
  })

  it('clamps drawing x onto the pane', () => {
    expect(clampXToPlot(740, 700)).toBe(700)
    expect(clampXToPlot(-8, 700)).toBe(0)
    expect(clampXToPlot(120, 700)).toBe(120)
  })
})

describe('fibLevelExtent', () => {
  it('keeps a short fib readable without crossing the price scale', () => {
    expect(fibLevelExtent(650, 660, 700)).toEqual({ left: 650, right: 700 })
  })

  it('does not expand past plot right when the min span would overflow', () => {
    expect(fibLevelExtent(680, 690, 700).right).toBe(700)
  })

  it('uses the real span when it is already wide enough', () => {
    expect(fibLevelExtent(100, 400, 700)).toEqual({ left: 100, right: 400 })
  })
})

describe('fibLabelPlacement', () => {
  it('puts labels to the right of the levels when they fit', () => {
    expect(fibLabelPlacement(400, 700)).toEqual({ x: 406, textAnchor: 'start' })
  })

  it('flips labels inside the pane when they would overlap the price scale', () => {
    expect(fibLabelPlacement(680, 700)).toEqual({ x: 674, textAnchor: 'end' })
  })
})
