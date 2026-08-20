import { describe, expect, it } from 'vitest'
import type { Candle } from './candleUtils'
import { applyMtPreviewState, summarizeMtPreview } from './mtPreview'

function bar(time: number, close = 1): Candle {
  return { time, open: close, high: close, low: close, close }
}

describe('applyMtPreviewState', () => {
  it('starts a preview from the first history dump', () => {
    const next = applyMtPreviewState(null, 'eurusd', [bar(100), bar(160)])
    expect(next.symbol).toBe('EURUSD')
    expect(next.candles).toHaveLength(2)
  })

  it('merges later bars into the same symbol', () => {
    const first = applyMtPreviewState(null, 'EURUSD', [bar(100, 1)])
    const next = applyMtPreviewState(first, 'EURUSD', [bar(100, 9), bar(160, 2)])
    expect(next.candles).toEqual([bar(100, 9), bar(160, 2)])
  })

  it('replaces the preview when the EA symbol changes', () => {
    const first = applyMtPreviewState(null, 'EURUSD', [bar(100)])
    const next = applyMtPreviewState(first, 'XAUUSD', [bar(200)])
    expect(next).toEqual({ symbol: 'XAUUSD', candles: [bar(200)] })
  })
})

describe('summarizeMtPreview', () => {
  it('returns null for an empty preview', () => {
    expect(summarizeMtPreview(null)).toBeNull()
    expect(summarizeMtPreview({ symbol: 'EURUSD', candles: [] })).toBeNull()
  })

  it('reports count and time range', () => {
    expect(summarizeMtPreview({ symbol: 'EURUSD', candles: [bar(100), bar(220)] })).toEqual({
      symbol: 'EURUSD',
      candleCount: 2,
      firstTime: 100,
      lastTime: 220
    })
  })
})
