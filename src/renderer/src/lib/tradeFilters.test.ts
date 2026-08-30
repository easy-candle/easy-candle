import { describe, expect, it } from 'vitest'
import type { ClosedTrade, PositionSide } from '@/lib/paperTrade'
import {
  applyTradeFilters,
  countBySide,
  EMPTY_TRADE_FILTERS,
  filterBySides,
  hasActiveFilters,
  sessionCountsUnderFilters,
  sideCountsUnderFilters,
  tradeSideLabel
} from './tradeFilters'

/** Unix seconds at a given UTC hour on a fixed date. */
function atHour(hour: number): number {
  return Date.UTC(2024, 4, 20, hour, 30, 0) / 1000
}

function trade(id: string, side: PositionSide, entryHour: number): ClosedTrade {
  return {
    id,
    side,
    entryPrice: 100,
    entryTime: atHour(entryHour),
    exitPrice: 101,
    exitTime: atHour(entryHour) + 3600,
    lots: 1,
    pnl: 1,
    exitReason: 'manual',
    takeProfit: null,
    stopLoss: null
  }
}

/** Tokyo-only, London-only, and London/New York overlap. */
const TRADES = [
  trade('tokyo-long', 'long', 3),
  trade('london-short', 'short', 9),
  trade('overlap-long', 'long', 14)
]

const ids = (trades: ClosedTrade[]): string[] => trades.map((t) => t.id)

describe('tradeSideLabel', () => {
  it('reads as Buy and Sell', () => {
    expect(tradeSideLabel('long')).toBe('Buy')
    expect(tradeSideLabel('short')).toBe('Sell')
  })
})

describe('filterBySides', () => {
  it('passes everything through with an empty selection', () => {
    expect(filterBySides(TRADES, [])).toHaveLength(3)
  })

  it('keeps a single side', () => {
    expect(ids(filterBySides(TRADES, ['long']))).toEqual(['tokyo-long', 'overlap-long'])
    expect(ids(filterBySides(TRADES, ['short']))).toEqual(['london-short'])
  })

  it('selecting both sides is the same as no filter', () => {
    expect(filterBySides(TRADES, ['long', 'short'])).toHaveLength(3)
  })
})

describe('applyTradeFilters', () => {
  it('is a no-op by default', () => {
    expect(applyTradeFilters(TRADES, EMPTY_TRADE_FILTERS)).toHaveLength(3)
  })

  it('ANDs session and side', () => {
    const kept = applyTradeFilters(TRADES, { sessions: ['london'], sides: ['long'] })
    expect(ids(kept)).toEqual(['overlap-long'])
  })

  it('can end up empty when the two dimensions do not intersect', () => {
    expect(applyTradeFilters(TRADES, { sessions: ['tokyo'], sides: ['short'] })).toHaveLength(0)
  })

  it('applies one dimension when the other is empty', () => {
    expect(ids(applyTradeFilters(TRADES, { sessions: ['tokyo'], sides: [] }))).toEqual([
      'tokyo-long'
    ])
    expect(ids(applyTradeFilters(TRADES, { sessions: [], sides: ['short'] }))).toEqual([
      'london-short'
    ])
  })
})

describe('hasActiveFilters', () => {
  it('is false only when both dimensions are empty', () => {
    expect(hasActiveFilters(EMPTY_TRADE_FILTERS)).toBe(false)
    expect(hasActiveFilters({ sessions: ['london'], sides: [] })).toBe(true)
    expect(hasActiveFilters({ sessions: [], sides: ['long'] })).toBe(true)
  })
})

describe('countBySide', () => {
  it('counts each side', () => {
    expect(countBySide(TRADES)).toEqual({ long: 2, short: 1 })
  })

  it('starts both sides at zero', () => {
    expect(countBySide([])).toEqual({ long: 0, short: 0 })
  })
})

describe('cross-dimension counts', () => {
  it('scopes session counts by the selected sides', () => {
    const counts = sessionCountsUnderFilters(TRADES, { sessions: [], sides: ['long'] })
    // Only the long trades: Tokyo 03:00 and the 14:00 London/New York overlap.
    expect(counts.tokyo).toBe(1)
    expect(counts.london).toBe(1)
    expect(counts.newYork).toBe(1)
  })

  it('ignores the session selection when counting sessions', () => {
    const narrow = sessionCountsUnderFilters(TRADES, { sessions: ['tokyo'], sides: [] })
    const wide = sessionCountsUnderFilters(TRADES, { sessions: [], sides: [] })
    expect(narrow).toEqual(wide)
  })

  it('scopes side counts by the selected sessions', () => {
    expect(sideCountsUnderFilters(TRADES, { sessions: ['london'], sides: [] })).toEqual({
      long: 1,
      short: 1
    })
    expect(sideCountsUnderFilters(TRADES, { sessions: ['tokyo'], sides: [] })).toEqual({
      long: 1,
      short: 0
    })
  })

  it('ignores the side selection when counting sides', () => {
    const narrow = sideCountsUnderFilters(TRADES, { sessions: [], sides: ['long'] })
    expect(narrow).toEqual({ long: 2, short: 1 })
  })
})
