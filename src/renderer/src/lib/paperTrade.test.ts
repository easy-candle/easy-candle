import { describe, expect, it } from 'vitest'
import {
  clampRiskReward,
  clampTradeSize,
  closePosition,
  cumulativeRealizedPnl,
  evaluatePendingFill,
  evaluateStopTakeProfit,
  formatPnl,
  formatPnlUsd,
  formatPositionSize,
  formatRiskReward,
  formatTradeSize,
  formatWinRate,
  isValidLimitPrice,
  isValidPendingStopLoss,
  isValidStopLoss,
  isValidTakeProfit,
  openPosition,
  pendingToPosition,
  placePendingLimit,
  pnlForSide,
  pnlScaleForSymbol,
  realizedRiskReward,
  rewindTradesAfterStepBack,
  sessionPerformance,
  sideReport,
  stopLossFromTakeProfit,
  summarizeSession,
  takeProfitFromStopLoss,
  canPlaceTicketSide,
  inferTicketSide,
  tradesToCsv,
  unrealizedPnl,
  withPendingPrice,
  withPendingStopLoss,
  withPendingTakeProfit,
  withStopLoss,
  withTakeProfit,
  type ClosedTrade,
  type PendingOrder,
  type Position
} from './paperTrade'

function flatClosed(
  partial: Partial<ClosedTrade> & Pick<ClosedTrade, 'id' | 'side' | 'pnl'>
): ClosedTrade {
  return {
    entryPrice: 100,
    entryTime: 1,
    exitPrice: 100,
    exitTime: 2,
    lots: 1,
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
        lots: 1,
        takeProfit: null,
        stopLoss: null,
        pendingPlacedTime: null
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
    const withBoth = withStopLoss(withLevels.position, 90, 100)
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

describe('pnlForSide contract size', () => {
  it('defaults to 1 unit when no symbol scale is passed', () => {
    expect(pnlForSide('long', 2300, 2302)).toBeCloseTo(2)
    expect(pnlForSide('short', 67000, 66900)).toBeCloseTo(100)
  })

  it('scales FX pips by a standard lot so EURUSD is not rounded to 0.00', () => {
    const scale = pnlScaleForSymbol('EURUSD')
    expect(scale.contractSize).toBe(100_000)
    expect(pnlForSide('long', 1.13889, 1.13854, scale)).toBeCloseTo(-35)
    expect(formatPnl(pnlForSide('long', 1.13889, 1.13854, scale))).toBe('-35.00')
  })

  it('scales gold by 100 oz per lot', () => {
    const scale = pnlScaleForSymbol('XAUUSD')
    expect(scale.contractSize).toBe(100)
    expect(pnlForSide('long', 4048.45, 4065.39, scale)).toBeCloseTo(1694)
    expect(pnlForSide('long', 4048.45, 4065.39, pnlScaleForSymbol('XAUUSD', 0.01))).toBeCloseTo(
      16.94
    )
  })

  it('treats crypto size as coin amount', () => {
    expect(pnlScaleForSymbol('BTCUSDT').contractSize).toBe(1)
    expect(pnlForSide('long', 67000, 67100, pnlScaleForSymbol('BTCUSDT', 1))).toBeCloseTo(100)
    expect(pnlForSide('long', 67000, 67100, pnlScaleForSymbol('BTCUSDT', 0.01))).toBeCloseTo(1)
  })

  it('multiplies lots on top of contract size', () => {
    expect(pnlForSide('long', 1.1, 1.2, { lots: 0.1, contractSize: 100_000 })).toBeCloseTo(1000)
  })

  it('closes with the symbol scale and stored lots', () => {
    const open = openPosition(null, 'long', 1.13889, 10, 't1', 0.1)
    expect(open.ok).toBe(true)
    if (!open.ok) return
    expect(open.position.lots).toBe(0.1)
    const closed = closePosition(
      open.position,
      1.13854,
      20,
      'manual',
      pnlScaleForSymbol('EURUSD', open.position.lots)
    )
    expect(closed.lots).toBe(0.1)
    expect(closed.pnl).toBeCloseTo(-3.5)
  })

  it('clamps lot size to the 0.01–100 standard range', () => {
    expect(clampTradeSize(0)).toBe(0.01)
    expect(clampTradeSize(1.234)).toBe(1.23)
    expect(clampTradeSize(999)).toBe(100)
    expect(formatTradeSize(1)).toBe('1.00')
    expect(formatTradeSize(0.1)).toBe('0.10')
  })

  it('does not cap crypto amount', () => {
    expect(clampTradeSize(0, 'amount')).toBe(1e-8)
    expect(clampTradeSize(250, 'amount')).toBe(250)
    expect(clampTradeSize(0.00012345, 'amount')).toBeCloseTo(0.00012345)
    expect(formatTradeSize(1, 'amount')).toBe('1')
    expect(formatTradeSize(0.01, 'amount')).toBe('0.01')
    expect(formatPositionSize(1, 'EURUSD')).toBe('1.00 lot')
    expect(formatPositionSize(0.1, 'XAUUSD')).toBe('0.10 lot')
    expect(formatPositionSize(0.5, 'BTCUSDT')).toBe('0.5')
  })
})

describe('risk:reward helpers', () => {
  it('formats and clamps R:R', () => {
    expect(formatRiskReward(2)).toBe('1:2')
    expect(formatRiskReward(1.5)).toBe('1:1.5')
    expect(clampRiskReward(0)).toBe(0.5)
    expect(clampRiskReward(99)).toBe(20)
    expect(clampRiskReward(1.26)).toBe(1.3)
  })

  it('derives TP from SL and SL from TP at R:R 2', () => {
    expect(takeProfitFromStopLoss('long', 100, 90, 2)).toBe(120)
    expect(stopLossFromTakeProfit('long', 100, 120, 2)).toBe(90)
    expect(takeProfitFromStopLoss('short', 100, 110, 2)).toBe(80)
    expect(stopLossFromTakeProfit('short', 100, 80, 2)).toBe(110)
    expect(realizedRiskReward('long', 100, 90, 120)).toBe(2)
  })

  it('skips lock-profit / invalid risk setups', () => {
    expect(takeProfitFromStopLoss('long', 100, 105, 2)).toBeNull()
    expect(stopLossFromTakeProfit('long', 100, 95, 2)).toBeNull()
    expect(realizedRiskReward('long', 100, 105, 120)).toBeNull()
  })
})

describe('TP/SL validation', () => {
  it('validates long and short sides', () => {
    expect(isValidTakeProfit('long', 100, 110)).toBe(true)
    expect(isValidTakeProfit('long', 100, 90)).toBe(false)
    // SL is validated against mark (current price), not entry
    expect(isValidStopLoss('long', 100, 90)).toBe(true)
    expect(isValidStopLoss('long', 100, 110)).toBe(false)
    // Long can trail SL above entry while mark is higher
    expect(isValidStopLoss('long', 120, 105)).toBe(true)
    expect(isValidStopLoss('long', 120, 120)).toBe(false)

    expect(isValidTakeProfit('short', 100, 90)).toBe(true)
    expect(isValidTakeProfit('short', 100, 110)).toBe(false)
    expect(isValidStopLoss('short', 100, 110)).toBe(true)
    expect(isValidStopLoss('short', 100, 90)).toBe(false)
    // Short can trail SL below entry while mark is lower
    expect(isValidStopLoss('short', 80, 95)).toBe(true)
    expect(isValidStopLoss('short', 80, 80)).toBe(false)
  })

  it('withTakeProfit / withStopLoss reject invalid prices', () => {
    const base: Position = {
      id: '1',
      side: 'long',
      entryPrice: 100,
      entryTime: 1,
      lots: 1,
      takeProfit: null,
      stopLoss: null
    }
    expect(withTakeProfit(base, 90).ok).toBe(false)
    expect(withStopLoss(base, 110, 100).ok).toBe(false)
    expect(withStopLoss(base, 90, null).ok).toBe(false)
    const okTp = withTakeProfit(base, 110)
    expect(okTp.ok).toBe(true)
    if (okTp.ok) expect(okTp.position.takeProfit).toBe(110)
  })

  it('allows stop loss past entry to lock profit', () => {
    const longPos: Position = {
      id: '1',
      side: 'long',
      entryPrice: 100,
      entryTime: 1,
      lots: 1,
      takeProfit: null,
      stopLoss: 90
    }
    const longOk = withStopLoss(longPos, 105, 120)
    expect(longOk.ok).toBe(true)
    if (longOk.ok) expect(longOk.position.stopLoss).toBe(105)

    const shortPos: Position = {
      id: '2',
      side: 'short',
      entryPrice: 100,
      entryTime: 1,
      lots: 1,
      takeProfit: null,
      stopLoss: 110
    }
    const shortOk = withStopLoss(shortPos, 95, 80)
    expect(shortOk.ok).toBe(true)
    if (shortOk.ok) expect(shortOk.position.stopLoss).toBe(95)
  })
})

describe('ticket draft side gates', () => {
  it('requires a limit price below/above mark', () => {
    const base = {
      orderType: 'limit' as const,
      markPrice: 100,
      limitPrice: null as number | null,
      takeProfit: null as number | null,
      stopLoss: null as number | null
    }
    expect(canPlaceTicketSide('long', base)).toBe(false)
    expect(canPlaceTicketSide('short', base)).toBe(false)
    expect(canPlaceTicketSide('long', { ...base, limitPrice: 99 })).toBe(true)
    expect(canPlaceTicketSide('short', { ...base, limitPrice: 99 })).toBe(false)
    expect(canPlaceTicketSide('short', { ...base, limitPrice: 101 })).toBe(true)
    expect(canPlaceTicketSide('long', { ...base, limitPrice: 101 })).toBe(false)
  })

  it('disables the side that TP/SL cannot serve', () => {
    const longSetup = {
      orderType: 'limit' as const,
      markPrice: 100,
      limitPrice: 95,
      takeProfit: 110,
      stopLoss: 90
    }
    expect(canPlaceTicketSide('long', longSetup)).toBe(true)
    expect(canPlaceTicketSide('short', longSetup)).toBe(false)
    expect(inferTicketSide(longSetup)).toBe('long')

    const shortSetup = {
      orderType: 'limit' as const,
      markPrice: 100,
      limitPrice: 105,
      takeProfit: 90,
      stopLoss: 110
    }
    expect(canPlaceTicketSide('short', shortSetup)).toBe(true)
    expect(canPlaceTicketSide('long', shortSetup)).toBe(false)
    expect(inferTicketSide(shortSetup)).toBe('short')
  })

  it('gates market tickets from TP/SL vs mark', () => {
    const market = {
      orderType: 'market' as const,
      markPrice: 100,
      limitPrice: null as number | null,
      takeProfit: 110,
      stopLoss: null as number | null
    }
    expect(canPlaceTicketSide('long', market)).toBe(true)
    expect(canPlaceTicketSide('short', market)).toBe(false)
    expect(canPlaceTicketSide('long', { ...market, takeProfit: null, stopLoss: null })).toBe(true)
    expect(canPlaceTicketSide('short', { ...market, takeProfit: null, stopLoss: null })).toBe(true)
  })
})

describe('evaluateStopTakeProfit', () => {
  const longBase: Position = {
    id: '1',
    side: 'long',
    entryPrice: 100,
    entryTime: 1,
    lots: 1,
    takeProfit: 110,
    stopLoss: 90
  }

  const shortBase: Position = {
    id: '2',
    side: 'short',
    entryPrice: 100,
    entryTime: 1,
    lots: 1,
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

  it('hits long SL above entry when locking profit', () => {
    const hit = evaluateStopTakeProfit(
      { ...longBase, stopLoss: 105, takeProfit: 130 },
      { high: 108, low: 104, close: 106 }
    )
    expect(hit).toEqual({ hit: 'sl', price: 105 })
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
    expect(evaluateStopTakeProfit(shortBase, { high: 105, low: 88, close: 95 })).toEqual({
      hit: 'tp',
      price: 90
    })
    expect(evaluateStopTakeProfit(shortBase, { high: 112, low: 95, close: 101 })).toEqual({
      hit: 'sl',
      price: 110
    })
  })

  it('returns null when levels unset or not touched', () => {
    expect(
      evaluateStopTakeProfit(
        { ...longBase, takeProfit: null, stopLoss: null },
        { high: 120, low: 80, close: 100 }
      )
    ).toBeNull()
    expect(evaluateStopTakeProfit(longBase, { high: 105, low: 95, close: 100 })).toBeNull()
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
      lots: 1,
      takeProfit: 120,
      stopLoss: 90,
      pendingPlacedTime: null
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
    expect(result.pendingOrder).toBeNull()
    expect(result.closedTrades).toHaveLength(0)
    expect(result.discardedEntryTimes).toEqual([20])
  })

  it('discards an open position when current is before entry', () => {
    const open: Position = {
      id: 't3',
      side: 'long',
      entryPrice: 100,
      entryTime: 20,
      lots: 1,
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
    expect(result.pendingOrder).toBeNull()
    expect(result.discardedEntryTimes).toEqual([20])
  })

  it('keeps an open position when still on or after entry candle', () => {
    const open: Position = {
      id: 't4',
      side: 'long',
      entryPrice: 100,
      entryTime: 10,
      lots: 1,
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
    expect(result.pendingOrder).toBeNull()
    expect(result.discardedEntryTimes).toEqual([])
  })
})

describe('pending limit orders', () => {
  const buyLimit: PendingOrder = {
    id: 'p1',
    side: 'long',
    price: 95,
    placedTime: 10,
    lots: 1,
    takeProfit: 110,
    stopLoss: 90
  }

  it('validates buy limit below mark and sell limit above mark', () => {
    expect(isValidLimitPrice('long', 100, 99)).toBe(true)
    expect(isValidLimitPrice('long', 100, 100)).toBe(false)
    expect(isValidLimitPrice('long', 100, 101)).toBe(false)
    expect(isValidLimitPrice('short', 100, 101)).toBe(true)
    expect(isValidLimitPrice('short', 100, 100)).toBe(false)
  })

  it('places a buy limit when flat and price is below mark', () => {
    const result = placePendingLimit({
      current: null,
      pending: null,
      side: 'long',
      price: 95,
      markPrice: 100,
      time: 10,
      id: 'p1',
      lots: 0.5
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pending).toEqual({
      id: 'p1',
      side: 'long',
      price: 95,
      placedTime: 10,
      lots: 0.5,
      takeProfit: null,
      stopLoss: null
    })
  })

  it('rejects a buy limit at or above mark', () => {
    const result = placePendingLimit({
      current: null,
      pending: null,
      side: 'long',
      price: 100,
      markPrice: 100,
      time: 10,
      id: 'p1'
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a second pending or a pending while in a position', () => {
    const placed = placePendingLimit({
      current: null,
      pending: null,
      side: 'short',
      price: 105,
      markPrice: 100,
      time: 10,
      id: 'p1'
    })
    expect(placed.ok).toBe(true)
    if (!placed.ok) return
    expect(
      placePendingLimit({
        current: null,
        pending: placed.pending,
        side: 'long',
        price: 90,
        markPrice: 100,
        time: 11,
        id: 'p2'
      }).ok
    ).toBe(false)

    const open = openPosition(null, 'long', 100, 10, 't1')
    expect(open.ok).toBe(true)
    if (!open.ok) return
    expect(
      placePendingLimit({
        current: open.position,
        pending: null,
        side: 'long',
        price: 90,
        markPrice: 100,
        time: 11,
        id: 'p2'
      }).ok
    ).toBe(false)
  })

  it('moves a pending limit and attaches TP/SL vs the limit price', () => {
    const moved = withPendingPrice(buyLimit, 94, 100)
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.pending.price).toBe(94)

    const tp = withPendingTakeProfit(moved.pending, 108)
    expect(tp.ok).toBe(true)
    const sl = withPendingStopLoss(moved.pending, 91)
    expect(sl.ok).toBe(true)
    expect(isValidPendingStopLoss('long', 94, 91)).toBe(true)
    expect(isValidPendingStopLoss('long', 94, 95)).toBe(false)
    expect(withPendingTakeProfit(moved.pending, 90).ok).toBe(false)
    expect(withPendingPrice(buyLimit, 101, 100).ok).toBe(false)

    const crossed = withPendingPrice(buyLimit, 111, 120)
    expect(crossed.ok).toBe(true)
    if (crossed.ok) {
      expect(crossed.pending.takeProfit).toBeNull()
      expect(crossed.pending.stopLoss).toBe(90)
    }
  })

  it('fills a buy limit when the candle trades through the price', () => {
    expect(evaluatePendingFill(buyLimit, { high: 100, low: 96, close: 98 })).toBe(false)
    expect(evaluatePendingFill(buyLimit, { high: 100, low: 94, close: 96 })).toBe(true)
    expect(evaluatePendingFill(buyLimit, { high: 96, low: 96, close: 95 })).toBe(true)

    const sell: PendingOrder = { ...buyLimit, side: 'short', price: 105 }
    expect(evaluatePendingFill(sell, { high: 104, low: 100, close: 102 })).toBe(false)
    expect(evaluatePendingFill(sell, { high: 106, low: 100, close: 104 })).toBe(true)
  })

  it('converts a filled pending into a position that keeps TP/SL and place time', () => {
    const position = pendingToPosition(buyLimit, 20)
    expect(position).toEqual({
      id: 'p1',
      side: 'long',
      entryPrice: 95,
      entryTime: 20,
      lots: 1,
      takeProfit: 110,
      stopLoss: 90,
      pendingPlacedTime: 10
    })
  })

  it('rewinds a filled limit back to pending, then drops it before place time', () => {
    const filled = pendingToPosition(buyLimit, 20)
    const afterFill = rewindTradesAfterStepBack({
      position: filled,
      pendingOrder: null,
      closedTrades: [],
      leftCandleTime: 20,
      currentCandleTime: 15
    })
    expect(afterFill.position).toBeNull()
    expect(afterFill.pendingOrder).toEqual(buyLimit)
    expect(afterFill.discardedEntryTimes).toEqual([20])

    const beforePlace = rewindTradesAfterStepBack({
      position: null,
      pendingOrder: buyLimit,
      closedTrades: [],
      leftCandleTime: 15,
      currentCandleTime: 5
    })
    expect(beforePlace.pendingOrder).toBeNull()
  })

  it('restores a pending when rewind of a same-bar fill+close lands after place', () => {
    const filled = pendingToPosition(buyLimit, 20)
    const closed = closePosition(filled, 90, 20, 'sl')
    const result = rewindTradesAfterStepBack({
      position: null,
      pendingOrder: null,
      closedTrades: [closed],
      leftCandleTime: 20,
      currentCandleTime: 15
    })
    expect(result.position).toBeNull()
    expect(result.pendingOrder).toEqual(buyLimit)
    expect(result.discardedEntryTimes).toEqual([20])
  })
})

describe('unrealizedPnl / cumulative / session', () => {
  it('computes unrealized long and short', () => {
    expect(
      unrealizedPnl(
        {
          id: '1',
          side: 'long',
          entryPrice: 100,
          entryTime: 1,
          lots: 1,
          takeProfit: null,
          stopLoss: null
        },
        110
      )
    ).toBeCloseTo(10)
    expect(
      unrealizedPnl(
        {
          id: '1',
          side: 'short',
          entryPrice: 100,
          entryTime: 1,
          lots: 1,
          takeProfit: null,
          stopLoss: null
        },
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
      {
        id: 'c',
        side: 'long',
        entryPrice: 10,
        entryTime: 5,
        lots: 1,
        takeProfit: null,
        stopLoss: null
      },
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

describe('formatPnlUsd', () => {
  it('formats overlay labels with USD', () => {
    expect(formatPnlUsd(1.2)).toBe('+ 1.20 USD')
    expect(formatPnlUsd(-3)).toBe('- 3.00 USD')
    expect(formatPnlUsd(0)).toBe('0.00 USD')
    expect(formatPnlUsd(null)).toBe('— USD')
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
      'id,side,lots,entryPrice,entryTimeUtc,exitPrice,exitTimeUtc,pnl,exitReason,takeProfit,stopLoss'
    )
    expect(lines[1]).toContain('a,long,1,100,')
    expect(lines[1]).toContain('1970-01-01T00:00:01.000Z')
    expect(lines[1]).toContain(',10,tp,110,90')
  })
})
