import type { Candle } from '@shared/candleUtils'

export type PositionSide = 'long' | 'short'

export type ExitReason = 'manual' | 'tp' | 'sl' | 'session_exit'

export type Position = {
  id: string
  side: PositionSide
  entryPrice: number
  entryTime: number
  takeProfit: number | null
  stopLoss: number | null
}

export type ClosedTrade = {
  id: string
  side: PositionSide
  entryPrice: number
  entryTime: number
  exitPrice: number
  exitTime: number
  pnl: number
  exitReason: ExitReason
  takeProfit: number | null
  stopLoss: number | null
}

export type SideReport = {
  count: number
  wins: number
  losses: number
  breakeven: number
  winRate: number | null
  totalPnl: number
  maxProfit: number | null
  maxLoss: number | null
}

export type SessionSummary = {
  overall: SideReport
  long: SideReport
  short: SideReport
}

export type LevelHit = {
  hit: 'tp' | 'sl'
  price: number
}

export function pnlForSide(side: PositionSide, entryPrice: number, markPrice: number): number {
  if (side === 'long') return markPrice - entryPrice
  return entryPrice - markPrice
}

export function isValidTakeProfit(
  side: PositionSide,
  entryPrice: number,
  price: number
): boolean {
  if (!Number.isFinite(price)) return false
  if (side === 'long') return price > entryPrice
  return price < entryPrice
}

export function isValidStopLoss(
  side: PositionSide,
  entryPrice: number,
  price: number
): boolean {
  if (!Number.isFinite(price)) return false
  if (side === 'long') return price < entryPrice
  return price > entryPrice
}

/** Apply take-profit when valid; pass null to clear. */
export function withTakeProfit(
  position: Position,
  price: number | null
): { ok: true; position: Position } | { ok: false; reason: string } {
  if (price == null) {
    return { ok: true, position: { ...position, takeProfit: null } }
  }
  if (!isValidTakeProfit(position.side, position.entryPrice, price)) {
    return {
      ok: false,
      reason:
        position.side === 'long'
          ? 'Take profit must be above entry'
          : 'Take profit must be below entry'
    }
  }
  return { ok: true, position: { ...position, takeProfit: price } }
}

/** Apply stop-loss when valid; pass null to clear. */
export function withStopLoss(
  position: Position,
  price: number | null
): { ok: true; position: Position } | { ok: false; reason: string } {
  if (price == null) {
    return { ok: true, position: { ...position, stopLoss: null } }
  }
  if (!isValidStopLoss(position.side, position.entryPrice, price)) {
    return {
      ok: false,
      reason:
        position.side === 'long'
          ? 'Stop loss must be below entry'
          : 'Stop loss must be above entry'
    }
  }
  return { ok: true, position: { ...position, stopLoss: price } }
}

export function openPosition(
  current: Position | null,
  side: PositionSide,
  price: number,
  time: number,
  id: string
): { ok: true; position: Position } | { ok: false; reason: string } {
  if (side !== 'long' && side !== 'short') {
    return { ok: false, reason: 'Invalid side' }
  }
  if (!Number.isFinite(price) || !Number.isFinite(time)) {
    return { ok: false, reason: 'Invalid fill' }
  }
  if (current) {
    return { ok: false, reason: 'Close the open position first' }
  }
  return {
    ok: true,
    position: {
      id,
      side,
      entryPrice: price,
      entryTime: time,
      takeProfit: null,
      stopLoss: null
    }
  }
}

/** Close the open position at mark price; returns realized trade. */
export function closePosition(
  position: Position,
  exitPrice: number,
  exitTime: number,
  exitReason: ExitReason = 'manual'
): ClosedTrade {
  if (!position) {
    throw new Error('No open position')
  }
  if (!Number.isFinite(exitPrice) || !Number.isFinite(exitTime)) {
    throw new Error('Invalid exit fill')
  }
  return {
    id: position.id,
    side: position.side,
    entryPrice: position.entryPrice,
    entryTime: position.entryTime,
    exitPrice,
    exitTime,
    pnl: pnlForSide(position.side, position.entryPrice, exitPrice),
    exitReason,
    takeProfit: position.takeProfit,
    stopLoss: position.stopLoss
  }
}

/** Rebuild an open position from a closed trade (for replay rewind). */
export function positionFromClosedTrade(trade: ClosedTrade): Position {
  return {
    id: trade.id,
    side: trade.side,
    entryPrice: trade.entryPrice,
    entryTime: trade.entryTime,
    takeProfit: trade.takeProfit,
    stopLoss: trade.stopLoss
  }
}

export type TradeRewindResult = {
  position: Position | null
  closedTrades: ClosedTrade[]
  /** Entry times whose open markers should be removed (forgotten / reset). */
  discardedEntryTimes: number[]
}

/**
 * After stepping one candle backward from `leftCandleTime` to `currentCandleTime`:
 * - Reopen a trade closed on the left candle (if still at/after its entry).
 * - Forget a trade entirely if rewind lands before its entry (reset decision).
 * - Drop an open position if current is before its entry.
 */
export function rewindTradesAfterStepBack(args: {
  position: Position | null
  closedTrades: ClosedTrade[]
  leftCandleTime: number
  currentCandleTime: number
}): TradeRewindResult {
  const { leftCandleTime, currentCandleTime } = args
  let position = args.position
  let closedTrades = Array.isArray(args.closedTrades) ? [...args.closedTrades] : []
  const discardedEntryTimes: number[] = []

  if (position && currentCandleTime < position.entryTime) {
    discardedEntryTimes.push(position.entryTime)
    position = null
  }

  if (!position) {
    let idx = -1
    for (let i = closedTrades.length - 1; i >= 0; i -= 1) {
      if (closedTrades[i].exitTime === leftCandleTime) {
        idx = i
        break
      }
    }

    if (idx >= 0) {
      const trade = closedTrades[idx]
      closedTrades = closedTrades.filter((_, i) => i !== idx)

      if (trade.entryTime <= currentCandleTime) {
        position = positionFromClosedTrade(trade)
      } else {
        // Landed before the open candle — forget this trade completely.
        discardedEntryTimes.push(trade.entryTime)
      }
    }
  }

  return { position, closedTrades, discardedEntryTimes }
}

/**
 * Check whether the candle's high/low (shadows) or close touches TP/SL.
 * If both hit on the same bar, SL wins (conservative).
 */
export function evaluateStopTakeProfit(
  position: Position,
  candle: Pick<Candle, 'high' | 'low' | 'close'>
): LevelHit | null {
  const { side, takeProfit, stopLoss } = position
  const { high, low, close } = candle

  if (
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return null
  }

  let slHit = false
  let tpHit = false

  if (stopLoss != null && Number.isFinite(stopLoss)) {
    if (side === 'long') {
      slHit = low <= stopLoss || close <= stopLoss
    } else {
      slHit = high >= stopLoss || close >= stopLoss
    }
  }

  if (takeProfit != null && Number.isFinite(takeProfit)) {
    if (side === 'long') {
      tpHit = high >= takeProfit || close >= takeProfit
    } else {
      tpHit = low <= takeProfit || close <= takeProfit
    }
  }

  if (slHit && stopLoss != null) {
    return { hit: 'sl', price: stopLoss }
  }
  if (tpHit && takeProfit != null) {
    return { hit: 'tp', price: takeProfit }
  }
  return null
}

export function unrealizedPnl(
  position: Position | null,
  markPrice: number | null | undefined
): number | null {
  if (!position || markPrice == null || !Number.isFinite(markPrice)) {
    return null
  }
  return pnlForSide(position.side, position.entryPrice, markPrice)
}

export function cumulativeRealizedPnl(closedTrades: ClosedTrade[]): number {
  if (!Array.isArray(closedTrades) || !closedTrades.length) return 0
  return closedTrades.reduce((sum, trade) => sum + trade.pnl, 0)
}

export function sessionPerformance(
  closedTrades: ClosedTrade[],
  open: Position | null,
  markPrice: number | null | undefined
): { realized: number; unrealized: number; total: number } {
  const realized = cumulativeRealizedPnl(closedTrades)
  const u = unrealizedPnl(open, markPrice)
  const unrealized = u == null ? 0 : u
  return {
    realized,
    unrealized,
    total: realized + unrealized
  }
}

export function formatPnl(pnl: number | null | undefined): string {
  if (pnl == null || !Number.isFinite(pnl)) return '—'
  const sign = pnl > 0 ? '+' : ''
  return `${sign}${pnl.toFixed(2)}`
}

export function sideReport(trades: ClosedTrade[]): SideReport {
  const list = Array.isArray(trades) ? trades : []
  let wins = 0
  let losses = 0
  let breakeven = 0
  let totalPnl = 0
  let maxProfit: number | null = null
  let maxLoss: number | null = null

  for (const trade of list) {
    const pnl = trade.pnl
    totalPnl += pnl
    if (pnl > 0) wins += 1
    else if (pnl < 0) losses += 1
    else breakeven += 1

    if (maxProfit == null || pnl > maxProfit) maxProfit = pnl
    if (maxLoss == null || pnl < maxLoss) maxLoss = pnl
  }

  return {
    count: list.length,
    wins,
    losses,
    breakeven,
    winRate: list.length ? wins / list.length : null,
    totalPnl,
    maxProfit,
    maxLoss
  }
}

export function summarizeSession(closedTrades: ClosedTrade[]): SessionSummary {
  const trades = Array.isArray(closedTrades) ? closedTrades : []
  return {
    overall: sideReport(trades),
    long: sideReport(trades.filter((t) => t.side === 'long')),
    short: sideReport(trades.filter((t) => t.side === 'short'))
  }
}

export function formatWinRate(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—'
  return `${(rate * 100).toFixed(1)}%`
}

export function formatExitReason(reason: ExitReason | undefined): string {
  switch (reason) {
    case 'tp':
      return 'TP'
    case 'sl':
      return 'SL'
    case 'session_exit':
      return 'Exit'
    case 'manual':
    default:
      return 'Manual'
  }
}

export function tradesToCsv(closedTrades: ClosedTrade[]): string {
  const header = [
    'id',
    'side',
    'entryPrice',
    'entryTimeUtc',
    'exitPrice',
    'exitTimeUtc',
    'pnl',
    'exitReason',
    'takeProfit',
    'stopLoss'
  ].join(',')

  const rows = (Array.isArray(closedTrades) ? closedTrades : []).map((trade) =>
    [
      csvEscape(trade.id),
      trade.side,
      trade.entryPrice,
      toIsoUtc(trade.entryTime),
      trade.exitPrice,
      toIsoUtc(trade.exitTime),
      trade.pnl,
      trade.exitReason,
      trade.takeProfit ?? '',
      trade.stopLoss ?? ''
    ].join(',')
  )

  return [header, ...rows].join('\n')
}

function toIsoUtc(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds)) return ''
  return new Date(unixSeconds * 1000).toISOString()
}

function csvEscape(value: string | number): string {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}
