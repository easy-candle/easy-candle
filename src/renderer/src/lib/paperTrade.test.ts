import { describe, expect, it } from 'vitest'
import {
  closePosition,
  cumulativeRealizedPnl,
  evaluateStopTakeProfit,
  formatPnl,
  formatWinRate,
  isValidStopLoss,
  isValidTakeProfit,
  openPosition,
  rewindTradesAfterStepBack,
  sessionPerformance,
  sideReport,
  summarizeSession,
  tradesToCsv,
  unrealizedPnl,
  withStopLoss,
  withTakeProfit,
  type ClosedTrade,
  type Position
} from './paperTrade'

function flatClosed(partial: Partial<ClosedTrade> & Pick<ClosedTrade, 'id' | 'side' | 'pnl'>): ClosedTrade {
  return {
    entryPrice: 100,
    entryTime: 1,
    exitPrice: 100,
    exitTime: 2,
    exitReason: 'manual',
    takeProfit: null,
    stopLoss: null,
    ...partial
  }
}

describe('openPosition', () => {
  it('opens a long when flat with null TP/SL', () => {
    const result = openPosition(null, 'long', 100, 50, 't1')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.position).toEqual({
        id: 't1',
        side: 'long',
        entryPrice: 100,
        entryTime: 50,
        takeProfit: null,
        stopLoss: null
      })
    }
  })

  it('rejects open when already in a position', () => {
    const open = openPosition(null, 'short', 90, 10, 't1')
    expect(open.ok).toBe(true)
    if (!open.ok) return
    const again = openPosition(open.position, 'long', 95, 20, 't2')
    expect(again.ok).toBe(false)
  })
})

describe('closePosition', () => {
  it('realizes long PnL and copies levels + reason', () => {
    const open = openPosition(null, 'long', 100, 10, 't1')
    expect(open.ok).toBe(true)
    if (!open.ok) return
    const withLevels = withTakeProfit(open.position, 120)
    expect(withLevels.ok).toBe(true)
    if (!withLevels.ok) return
    const withBoth = withStopLoss(withLevels.position, 90)
    expect(withBoth.ok).toBe(true)
    if (!withBoth.ok) return

    const closed = closePosition(withBoth.position, 112, 20, 'manual')
    expect(closed.pnl).toBeCloseTo(12)
    expect(closed.exitPrice).toBe(112)
    expect(closed.exitReason).toBe('manual')
    expect(closed.takeProfit).toBe(120)
    expect(closed.stopLoss).toBe(90)
  })

  it('realizes short PnL', () => {
    const open = openPosition(null, 'short', 100, 10, 't1')
    expect(open.ok).toBe(true)
    if (!open.ok) return
    const closed = closePosition(open.position, 90, 20)
    expect(closed.pnl).toBeCloseTo(10)
    expect(closed.exitReason).toBe('manual')
  })
})

describe('TP/SL validation', () => {
  it('validates long and short sides', () => {
    expect(isValidTakeProfit('long', 100, 110)).toBe(true)
    expect(isValidTakeProfit('long', 100, 90)).toBe(false)
    expect(isValidStopLoss('long', 100, 90)).toBe(true)
    expect(isValidStopLoss('long', 100, 110)).toBe(false)

    expect(isValidTakeProfit('short', 100, 90)).toBe(true)
    expect(isValidTakeProfit('short', 100, 110)).toBe(false)
    expect(isValidStopLoss('short', 100, 110)).toBe(true)
    expect(isValidStopLoss('short', 100, 90)).toBe(false)
  })

  it('withTakeProfit / withStopLoss reject invalid prices', () => {
    const base: Position = {
      id: '1',
      side: 'long',
      entryPrice: 100,
      entryTime: 1,
      takeProfit: null,
      stopLoss: null
    }
    expect(withTakeProfit(base, 90).ok).toBe(false)
    expect(withStopLoss(base, 110).ok).toBe(false)
    const okTp = withTakeProfit(base, 110)
    expect(okTp.ok).toBe(true)
    if (okTp.ok) expect(okTp.position.takeProfit).toBe(110)
  })
})

describe('evaluateStopTakeProfit', () => {
  const longBase: Position = {
    id: '1',
    side: 'long',
    entryPrice: 100,
    entryTime: 1,
    takeProfit: 110,
    stopLoss: 90
  }

  const shortBase: Position = {
    id: '2',
    side: 'short',
    entryPrice: 100,
    entryTime: 1,
    takeProfit: 90,
    stopLoss: 110
  }

  it('hits long TP on wick only', () => {
    const hit = evaluateStopTakeProfit(longBase, {
      high: 111,
      low: 99,
      close: 105
    })
    expect(hit).toEqual({ hit: 'tp', price: 110 })
  })

  it('hits long SL on wick only', () => {
    const hit = evaluateStopTakeProfit(longBase, {
      high: 105,
      low: 89,
      close: 102
    })
    expect(hit).toEqual({ hit: 'sl', price: 90 })
  })

  it('hits long SL on close cross without wick preference', () => {
    const hit = evaluateStopTakeProfit(longBase, {
      high: 100,
      low: 91,
      close: 90
    })
    expect(hit).toEqual({ hit: 'sl', price: 90 })
  })

  it('prefers SL when both hit same bar', () => {
    const hit = evaluateStopTakeProfit(longBase, {
      high: 115,
      low: 85,
      close: 100
    })
    expect(hit).toEqual({ hit: 'sl', price: 90 })
  })

  it('hits short TP and SL correctly', () => {
    expect(
      evaluateStopTakeProfit(shortBase, { high: 105, low: 88, close: 95 })
    ).toEqual({ hit: 'tp', price: 90 })
    expect(
      evaluateStopTakeProfit(shortBase, { high: 112, low: 95, close: 101 })
    ).toEqual({ hit: 'sl', price: 110 })
  })

  it('returns null when levels unset or not touched', () => {
    expect(
      evaluateStopTakeProfit(
        { ...longBase, takeProfit: null, stopLoss: null },
        { high: 120, low: 80, close: 100 }
      )
    ).toBeNull()
    expect(
      evaluateStopTakeProfit(longBase, { high: 105, low: 95, close: 100 })
    ).toBeNull()
  })
})

describe('rewindTradesAfterStepBack', () => {
  const closedAt20 = flatClosed({
    id: 't1',
    side: 'long',
    entryPrice: 100,
    entryTime: 10,
    exitPrice: 90,
    exitTime: 20,
    pnl: -10,
    exitReason: 'sl',
    takeProfit: 120,
    stopLoss: 90
  })

  it('reopens a trade closed on the left candle and restores TP/SL', () => {
    const result = rewindTradesAfterStepBack({
      position: null,
      closedTrades: [closedAt20],
      leftCandleTime: 20,
      currentCandleTime: 15
    })
    expect(result.closedTrades).toHaveLength(0)
    expect(result.position).toEqual({
      id: 't1',
      side: 'long',
      entryPrice: 100,
      entryTime: 10,
      takeProfit: 120,
      stopLoss: 90
    })
    expect(result.discardedEntryTimes).toEqual([])
  })

  it('forgets a closed trade when rewind lands before its entry', () => {
    const sameBar = flatClosed({
      id: 't2',
      side: 'short',
      entryPrice: 100,
      entryTime: 20,
      exitPrice: 95,
      exitTime: 20,
      pnl: 5,
      exitReason: 'manual',
      takeProfit: 90,
      stopLoss: 110
    })
    const result = rewindTradesAfterStepBack({
      position: null,
      closedTrades: [sameBar],
      leftCandleTime: 20,
      currentCandleTime: 15
    })
    expect(result.position).toBeNull()
    expect(result.closedTrades).toHaveLength(0)
    expect(result.discardedEntryTimes).toEqual([20])
  })

  it('discards an open position when current is before entry', () => {
    const open: Position = {
      id: 't3',
      side: 'long',
      entryPrice: 100,
      entryTime: 20,
      takeProfit: 110,
      stopLoss: 90
    }
    const result = rewindTradesAfterStepBack({
      position: open,
      closedTrades: [],
      leftCandleTime: 20,
      currentCandleTime: 15
    })
    expect(result.position).toBeNull()
    expect(result.discardedEntryTimes).toEqual([20])
  })

  it('keeps an open position when still on or after entry candle', () => {
    const open: Position = {
      id: 't4',
      side: 'long',
      entryPrice: 100,
      entryTime: 10,
      takeProfit: null,
      stopLoss: null
    }
    const result = rewindTradesAfterStepBack({
      position: open,
      closedTrades: [],
      leftCandleTime: 15,
      currentCandleTime: 10
    })
    expect(result.position).toEqual(open)
    expect(result.discardedEntryTimes).toEqual([])
  })
})

describe('unrealizedPnl / cumulative / session', () => {
  it('computes unrealized long and short', () => {
    expect(
      unrealizedPnl(
        { id: '1', side: 'long', entryPrice: 100, entryTime: 1, takeProfit: null, stopLoss: null },
        110
      )
    ).toBeCloseTo(10)
    expect(
      unrealizedPnl(
        { id: '1', side: 'short', entryPrice: 100, entryTime: 1, takeProfit: null, stopLoss: null },
        90
      )
    ).toBeCloseTo(10)
    expect(unrealizedPnl(null, 100)).toBeNull()
  })

  it('sums realized and session total', () => {
    const closed = [
      flatClosed({
        id: 'a',
        side: 'long',
        entryPrice: 100,
        entryTime: 1,
        exitPrice: 110,
        exitTime: 2,
        pnl: 10
      }),
      flatClosed({
        id: 'b',
        side: 'short',
        entryPrice: 50,
        entryTime: 3,
        exitPrice: 55,
        exitTime: 4,
        pnl: -5
      })
    ]
    expect(cumulativeRealizedPnl(closed)).toBeCloseTo(5)
    const perf = sessionPerformance(
      closed,
      { id: 'c', side: 'long', entryPrice: 10, entryTime: 5, takeProfit: null, stopLoss: null },
      12
    )
    expect(perf.realized).toBeCloseTo(5)
    expect(perf.unrealized).toBeCloseTo(2)
    expect(perf.total).toBeCloseTo(7)
  })
})

describe('formatPnl', () => {
  it('formats signed values', () => {
    expect(formatPnl(1.2)).toBe('+1.20')
    expect(formatPnl(-3)).toBe('-3.00')
    expect(formatPnl(null)).toBe('—')
  })
})

describe('summarizeSession / export', () => {
  const sample = [
    flatClosed({
      id: 'a',
      side: 'long',
      entryPrice: 100,
      entryTime: 1,
      exitPrice: 110,
      exitTime: 2,
      pnl: 10,
      exitReason: 'tp',
      takeProfit: 110,
      stopLoss: 90
    }),
    flatClosed({
      id: 'b',
      side: 'long',
      entryPrice: 100,
      entryTime: 3,
      exitPrice: 95,
      exitTime: 4,
      pnl: -5,
      exitReason: 'sl',
      takeProfit: 110,
      stopLoss: 95
    }),
    flatClosed({
      id: 'c',
      side: 'short',
      entryPrice: 50,
      entryTime: 5,
      exitPrice: 40,
      exitTime: 6,
      pnl: 10
    }),
    flatClosed({
      id: 'd',
      side: 'short',
      entryPrice: 50,
      entryTime: 7,
      exitPrice: 60,
      exitTime: 8,
      pnl: -10
    })
  ]

  it('computes overall and side reports', () => {
    const summary = summarizeSession(sample)
    expect(summary.overall.count).toBe(4)
    expect(summary.overall.wins).toBe(2)
    expect(summary.overall.losses).toBe(2)
    expect(summary.overall.winRate).toBeCloseTo(0.5)
    expect(summary.overall.totalPnl).toBeCloseTo(5)
    expect(summary.overall.maxProfit).toBeCloseTo(10)
    expect(summary.overall.maxLoss).toBeCloseTo(-10)

    expect(summary.long.count).toBe(2)
    expect(summary.long.winRate).toBeCloseTo(0.5)
    expect(summary.long.totalPnl).toBeCloseTo(5)
    expect(summary.long.maxProfit).toBeCloseTo(10)
    expect(summary.long.maxLoss).toBeCloseTo(-5)

    expect(summary.short.count).toBe(2)
    expect(summary.short.totalPnl).toBeCloseTo(0)
    expect(summary.short.maxLoss).toBeCloseTo(-10)
  })

  it('handles empty sessions', () => {
    const empty = sideReport([])
    expect(empty.count).toBe(0)
    expect(empty.winRate).toBeNull()
    expect(empty.maxProfit).toBeNull()
    expect(formatWinRate(null)).toBe('—')
    expect(formatWinRate(0.5)).toBe('50.0%')
  })

  it('exports CSV with header, exit reason, and levels', () => {
    const csv = tradesToCsv([sample[0]])
    const lines = csv.split('\n')
    expect(lines[0]).toBe(
      'id,side,entryPrice,entryTimeUtc,exitPrice,exitTimeUtc,pnl,exitReason,takeProfit,stopLoss'
    )
    expect(lines[1]).toContain('a,long,100,')
    expect(lines[1]).toContain('1970-01-01T00:00:01.000Z')
    expect(lines[1]).toContain(',10,tp,110,90')
  })
})
