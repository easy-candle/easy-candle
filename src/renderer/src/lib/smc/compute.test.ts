import { describe, expect, it } from 'vitest'
import type { Candle } from '@shared/candleUtils'
import { computeSmc } from './compute'
import { DEFAULT_SMC_SETTINGS } from './settings'
import type { SmcSettings } from './types'

const BASE = 1_700_000_000

function bar(
  i: number,
  open: number,
  high: number,
  low: number,
  close: number
): Candle {
  return { time: BASE + i * 60, open, high, low, close }
}

/** Flat bars that neither confirm a new pivot nor break structure. */
function flats(from: number, count: number, price: number): Candle[] {
  return Array.from({ length: count }, (_, n) => {
    const i = from + n
    return bar(i, price, price + 0.4, price - 0.4, price)
  })
}

const compact: SmcSettings = {
  ...DEFAULT_SMC_SETTINGS,
  internalPivotSize: 2,
  swingPivotSize: 2,
  swingOrderBlockCount: 5
}

describe('computeSmc', () => {
  it('returns an empty scene for too few candles', () => {
    expect(computeSmc([])).toEqual({ segments: [], boxes: [], labels: [] })
    expect(computeSmc([bar(0, 1, 2, 0, 1)])).toEqual({
      segments: [],
      boxes: [],
      labels: []
    })
  })

  it('emits a bullish BOS after a confirmed pivot high is crossed', () => {
    // Pivot high at bar 0 (high=10) confirmed at bar 2. Close 11 crosses it.
    const candles = [
      bar(0, 9, 10, 8.5, 9),
      bar(1, 8.5, 8.8, 8, 8.4),
      bar(2, 8.4, 8.7, 8, 8.3),
      bar(3, 8.5, 12, 8.5, 11)
    ]
    const scene = computeSmc(candles, compact)
    const bos = scene.segments.filter((s) => s.tag === 'BOS' && s.bias === 'bull')
    // Internal and swing share size 2, so internal is skipped as a duplicate level.
    expect(bos).toHaveLength(1)
    expect(bos[0]?.layer).toBe('swing')
    expect(bos[0]?.style).toBe('solid')
    expect(bos[0]?.p1).toBe(10)
    expect(bos[0]?.t1).toBe(BASE)
    expect(bos[0]?.t2).toBe(BASE + 3 * 60)
    expect(scene.labels.some((l) => l.text === 'BOS')).toBe(true)
    expect(scene.boxes.some((b) => b.tag === 'ob' && b.bias === 'bull')).toBe(true)
  })

  it('emits a CHoCH when price breaks against the current swing bias', () => {
    const candles = [
      bar(0, 9, 10, 8.5, 9),
      bar(1, 8.5, 8.8, 8, 8.4),
      bar(2, 8.4, 8.7, 8, 8.3),
      bar(3, 8.5, 12, 8.5, 11),
      // Pivot low at bar 4 (low=7) confirmed at bar 6 — high stays below later bars
      // so this bar is not also a pivot high.
      bar(4, 8, 8.5, 7, 7.5),
      bar(5, 7.8, 9, 7.6, 8.5),
      bar(6, 8.5, 9.2, 8.2, 8.8),
      bar(7, 8, 8.2, 6, 6.5)
    ]
    const scene = computeSmc(candles, compact)
    const choch = scene.segments.filter((s) => s.tag === 'CHoCH' && s.bias === 'bear')
    expect(choch.length).toBeGreaterThanOrEqual(1)
    expect(choch[0]?.p1).toBe(7)
    expect(choch[0]?.layer).toBe('swing')
  })

  it('keeps both internal and swing structure when lookbacks differ', () => {
    const settings: SmcSettings = {
      ...DEFAULT_SMC_SETTINGS,
      internalPivotSize: 2,
      swingPivotSize: 4
    }
    const seq: Candle[] = [
      bar(0, 19, 20, 18, 19),
      bar(1, 12, 12.4, 11.6, 12),
      bar(2, 12, 12.3, 11.6, 12),
      bar(3, 12, 12.2, 11.6, 12),
      bar(4, 12, 12.1, 11.6, 12),
      bar(5, 12, 13, 11.8, 12.5),
      bar(6, 12.4, 12.6, 12.2, 12.4),
      bar(7, 12.4, 12.5, 12.2, 12.3),
      bar(8, 12.5, 14, 12.5, 13.5),
      bar(9, 14, 22, 14, 21)
    ]
    const scene = computeSmc(seq, settings)
    const internalBos = scene.segments.filter((s) => s.layer === 'internal' && s.tag === 'BOS')
    const swingBos = scene.segments.filter((s) => s.layer === 'swing' && s.tag === 'BOS')
    expect(internalBos.length).toBeGreaterThanOrEqual(1)
    expect(internalBos[0]?.style).toBe('dashed')
    expect(swingBos).toHaveLength(1)
    expect(swingBos[0]?.style).toBe('solid')
    expect(swingBos[0]?.p1).toBe(20)
  })

  it('places a demand OB on the lowest bar of a bullish impulse', () => {
    const candles = [
      bar(0, 9, 10, 8.5, 9),
      bar(1, 8.5, 8.8, 7, 8.4),
      bar(2, 8.4, 8.7, 8, 8.3),
      bar(3, 8.5, 12, 8.5, 11)
    ]
    const scene = computeSmc(candles, compact)
    const ob = scene.boxes.find((b) => b.tag === 'ob' && b.bias === 'bull')
    expect(ob).toBeDefined()
    expect(ob?.p2).toBe(7)
    expect(ob?.t1).toBe(BASE + 60)
    expect(ob?.extendRight).toBe(true)
  })

  it('drops a demand OB once a wick trades through it', () => {
    const candles = [
      bar(0, 9, 10, 8.5, 9),
      bar(1, 8.5, 8.8, 7, 8.4),
      bar(2, 8.4, 8.7, 8, 8.3),
      bar(3, 8.5, 12, 8.5, 11),
      bar(4, 8, 8.2, 6, 6.5)
    ]
    const scene = computeSmc(candles, compact)
    expect(scene.boxes.some((b) => b.tag === 'ob' && b.bias === 'bull')).toBe(false)
  })

  it('detects an unmitigated bullish FVG', () => {
    const candles = [
      bar(0, 8, 10, 8, 9),
      bar(1, 12, 15, 12, 14),
      bar(2, 16, 18, 16, 17)
    ]
    const scene = computeSmc(candles, compact)
    const fvg = scene.boxes.filter((b) => b.tag === 'fvg' && b.bias === 'bull')
    expect(fvg).toHaveLength(1)
    expect(fvg[0]?.p1).toBe(16)
    expect(fvg[0]?.p2).toBe(10)
    expect(fvg[0]?.extendRight).toBe(false)
    expect(fvg[0]?.fromBarRight).toBe(true)
    expect(fvg[0]?.midline).toBe(true)
    expect(fvg[0]?.border).toBeTruthy()
  })

  it('removes a bullish FVG after price fills it', () => {
    const candles = [
      bar(0, 8, 10, 8, 9),
      bar(1, 12, 15, 12, 14),
      bar(2, 16, 18, 16, 17),
      bar(3, 12, 13, 9, 10)
    ]
    const scene = computeSmc(candles, compact)
    expect(scene.boxes.some((b) => b.tag === 'fvg')).toBe(false)
  })

  it('uses LuxAlgo default lookbacks when settings are omitted', () => {
    const candles = flats(0, 60, 100)
    candles[0] = bar(0, 100, 120, 99, 100)
    for (let i = 1; i <= 50; i += 1) {
      candles[i] = bar(i, 100, 101, 99.5, 100)
    }
    candles[51] = bar(51, 100, 125, 100, 122)
    const scene = computeSmc(candles)
    const swing = scene.segments.find((s) => s.layer === 'swing')
    expect(swing).toBeDefined()
    expect(swing?.p1).toBe(120)
  })

  it('skips a volatile impulse candle when picking the order block', () => {
    const settings: SmcSettings = {
      ...compact,
      atrPeriod: 3,
      obFilterMult: 2
    }
    const candles = [
      bar(0, 9.8, 10, 9.6, 9.8),
      bar(1, 9.6, 9.7, 9.5, 9.6),
      bar(2, 9.4, 9.6, 5, 9.4),
      bar(3, 9.8, 12, 9.6, 11)
    ]
    const scene = computeSmc(candles, settings)
    const ob = scene.boxes.find((b) => b.tag === 'ob' && b.bias === 'bull')
    expect(ob).toBeDefined()
    expect(ob?.p2).not.toBe(5)
    expect(ob?.t1).toBe(BASE + 60)
  })

  it('draws only the newest internal order blocks', () => {
    const settings: SmcSettings = {
      ...DEFAULT_SMC_SETTINGS,
      internalPivotSize: 2,
      swingPivotSize: 50,
      swingOrderBlockCount: 0,
      internalOrderBlockCount: 2
    }
    const candles: Candle[] = []
    let i = 0
    function pushImpulse(pivotHigh: number, breakClose: number): void {
      candles.push(bar(i++, pivotHigh - 0.2, pivotHigh, pivotHigh - 0.5, pivotHigh - 0.1))
      candles.push(bar(i++, pivotHigh - 1, pivotHigh - 0.8, pivotHigh - 1.2, pivotHigh - 1))
      candles.push(bar(i++, pivotHigh - 1, pivotHigh - 0.9, pivotHigh - 1.1, pivotHigh - 1))
      candles.push(bar(i++, breakClose - 1, breakClose, breakClose - 1, breakClose))
    }
    pushImpulse(10, 11)
    pushImpulse(12, 13)
    pushImpulse(14, 15)
    const scene = computeSmc(candles, settings)
    const obs = scene.boxes.filter((b) => b.tag === 'ob')
    expect(obs).toHaveLength(2)
  })
})
