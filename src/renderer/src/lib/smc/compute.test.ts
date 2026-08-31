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

/**
 * LuxAlgo legs start bearish, so the first stored swing is a low.
 * Size-2 path: low 7 (bar 0) → high 12 (bar 3) → close through 12 (bar 6).
 */
function lowHighBreak(dipLow = 10.8, breakHigh = 13, breakClose = 12.5): Candle[] {
  return [
    bar(0, 8, 8.5, 7, 7.8),
    bar(1, 8, 9.5, 7.6, 9),
    bar(2, 9, 9.8, 8.5, 9.4),
    bar(3, 10, 12, 9.6, 11.5),
    bar(4, 11.2, 11.6, dipLow, 11.1),
    bar(5, 11, 11.5, 10.7, 11),
    bar(6, 11.2, breakHigh, 11, breakClose)
  ]
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
    const scene = computeSmc(lowHighBreak(), compact)
    const bos = scene.segments.filter((s) => s.tag === 'BOS' && s.bias === 'bull')
    expect(bos).toHaveLength(1)
    expect(bos[0]?.layer).toBe('swing')
    expect(bos[0]?.style).toBe('solid')
    expect(bos[0]?.p1).toBe(12)
    expect(bos[0]?.t1).toBe(BASE + 3 * 60)
    expect(bos[0]?.t2).toBe(BASE + 6 * 60)
    expect(scene.labels.some((l) => l.text === 'BOS')).toBe(true)
    expect(scene.boxes.some((b) => b.tag === 'ob' && b.bias === 'bull')).toBe(true)
  })

  it('emits a CHoCH when price breaks against the current swing bias', () => {
    const candles = [...lowHighBreak(), bar(7, 10, 11, 6, 6.5)]
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
      bar(0, 11, 12, 10, 11),
      bar(1, 11.2, 12.2, 10.8, 11.4),
      bar(2, 11.4, 12.4, 11, 11.6),
      bar(3, 12, 14, 11.8, 13.5),
      bar(4, 13, 13.5, 12.8, 13),
      bar(5, 13, 13.4, 12.9, 13.1),
      bar(6, 13.2, 15, 13, 14.5),
      bar(7, 15, 20, 14.8, 18),
      bar(8, 18, 18.5, 17, 18),
      bar(9, 18, 18.4, 17.2, 18),
      bar(10, 18, 18.3, 17.4, 18),
      bar(11, 18, 18.2, 17.5, 18),
      bar(12, 19, 22, 19, 21)
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
    const scene = computeSmc(lowHighBreak(8), compact)
    const ob = scene.boxes.find((b) => b.tag === 'ob' && b.bias === 'bull')
    expect(ob).toBeDefined()
    expect(ob?.p2).toBe(8)
    expect(ob?.t1).toBe(BASE + 4 * 60)
    expect(ob?.extendRight).toBe(true)
  })

  it('drops a demand OB once a wick trades through it', () => {
    const candles = [...lowHighBreak(8), bar(7, 10, 11, 6, 6.5)]
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
    const candles = flats(0, 110, 100)
    candles[0] = bar(0, 100, 101, 90, 100)
    for (let i = 1; i <= 50; i += 1) {
      candles[i] = bar(i, 100, 101, 99.5, 100)
    }
    candles[51] = bar(51, 100, 120, 99, 110)
    for (let i = 52; i <= 101; i += 1) {
      candles[i] = bar(i, 110, 111, 109, 110)
    }
    candles[102] = bar(102, 110, 125, 110, 122)
    const scene = computeSmc(candles)
    const swing = scene.segments.find((s) => s.layer === 'swing' && s.tag === 'BOS')
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
      bar(0, 9.65, 9.72, 9.5, 9.66),
      bar(1, 9.66, 9.74, 9.6, 9.7),
      bar(2, 9.7, 9.76, 9.62, 9.72),
      bar(3, 9.72, 10, 9.7, 9.9),
      bar(4, 9.8, 9.85, 5, 9.7),
      bar(5, 9.7, 9.82, 9.68, 9.75),
      bar(6, 9.8, 12, 9.75, 11)
    ]
    const scene = computeSmc(candles, settings)
    const ob = scene.boxes.find((b) => b.tag === 'ob' && b.bias === 'bull')
    expect(ob).toBeDefined()
    expect(ob?.p2).not.toBe(5)
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

  it('does not walk the trailing low up through later higher lows', () => {
    const candles = [
      bar(0, 8, 8.5, 7, 7.8),
      bar(1, 8, 9.5, 7.6, 9),
      bar(2, 9, 9.8, 8.5, 9.4),
      // Later local lows that would confirm as size-2 pivots, but the leg is
      // already bullish so LuxAlgo must keep the original swing low at 7.
      bar(3, 9.5, 10, 8, 9.6),
      bar(4, 9.6, 10.1, 8.2, 9.7),
      bar(5, 9.7, 10.2, 8.4, 9.8),
      bar(6, 10, 12, 9.6, 11.5),
      bar(7, 11.2, 11.6, 10.8, 11.1),
      bar(8, 11, 11.5, 10.7, 11),
      bar(9, 11.2, 13, 11, 12.5)
    ]
    const scene = computeSmc(candles, compact)
    const low = scene.segments.find((s) => s.tag === 'Strong Low' || s.tag === 'Weak Low')
    expect(low?.p1).toBe(7)
    expect(low?.tag).toBe('Strong Low')
  })

  it('tags a Weak High after a bullish BOS and tracks the running max', () => {
    const scene = computeSmc(lowHighBreak(), compact)
    const high = scene.segments.find((s) => s.tag === 'Weak High')
    expect(high).toBeDefined()
    expect(high?.p1).toBe(13)
    expect(high?.t1).toBe(BASE + 6 * 60)
    expect(high?.extendRight).toBe(true)
    expect(high?.bias).toBe('bear')
    expect(scene.labels.some((l) => l.text === 'Weak High' && l.atRight)).toBe(true)
    expect(scene.segments.some((s) => s.tag === 'Strong High')).toBe(false)
  })

  it('tags Strong High and Weak Low after a bearish CHoCH', () => {
    const candles = [...lowHighBreak(), bar(7, 10, 11, 6, 6.5)]
    const scene = computeSmc(candles, compact)
    const high = scene.segments.find((s) => s.tag === 'Strong High')
    const low = scene.segments.find((s) => s.tag === 'Weak Low')
    expect(high?.p1).toBe(13)
    expect(high?.extendRight).toBe(true)
    expect(low?.p1).toBe(6)
    expect(low?.t1).toBe(BASE + 7 * 60)
    expect(low?.extendRight).toBe(true)
    expect(scene.labels.some((l) => l.text === 'Strong High' && l.atRight)).toBe(true)
    expect(scene.labels.some((l) => l.text === 'Weak Low' && l.atRight)).toBe(true)
  })

  it('tags Strong Low after a bullish break when a swing low is confirmed', () => {
    const scene = computeSmc(lowHighBreak(), compact)
    const low = scene.segments.find((s) => s.tag === 'Strong Low')
    expect(low).toBeDefined()
    expect(low?.p1).toBe(7)
    expect(low?.bias).toBe('bull')
    expect(scene.labels.some((l) => l.text === 'Strong Low')).toBe(true)
  })

  it('omits strong/weak high/low when the setting is off', () => {
    const scene = computeSmc(lowHighBreak(), { ...compact, showHighLowSwings: false })
    expect(scene.labels.some((l) => l.atRight)).toBe(false)
    expect(scene.segments.some((s) => s.tag === 'Weak High' || s.tag === 'Strong High')).toBe(false)
  })
})
