import { describe, expect, it } from 'vitest'
import { sameOverlayViewport, type OverlayViewportSnapshot } from './overlayViewport'

function snap(patch: Partial<OverlayViewportSnapshot> = {}): OverlayViewportSnapshot {
  return {
    width: 800,
    height: 400,
    timeFrom: 10,
    timeTo: 40,
    priceFrom: 100,
    priceTo: 120,
    ...patch
  }
}

describe('sameOverlayViewport', () => {
  it('is false when there is no previous snapshot', () => {
    expect(sameOverlayViewport(null, snap())).toBe(false)
  })

  it('is true when plot size and visible ranges match', () => {
    expect(sameOverlayViewport(snap(), snap())).toBe(true)
  })

  it('is false when the plot is resized or the visible range moves', () => {
    const base = snap()
    expect(sameOverlayViewport(base, snap({ width: 801 }))).toBe(false)
    expect(sameOverlayViewport(base, snap({ height: 401 }))).toBe(false)
    expect(sameOverlayViewport(base, snap({ timeFrom: 11 }))).toBe(false)
    expect(sameOverlayViewport(base, snap({ timeTo: 41 }))).toBe(false)
    expect(sameOverlayViewport(base, snap({ priceFrom: 99 }))).toBe(false)
    expect(sameOverlayViewport(base, snap({ priceTo: 121 }))).toBe(false)
  })
})
