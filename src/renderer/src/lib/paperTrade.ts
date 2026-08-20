import type { Candle } from '@shared/candleUtils'
import {
  contractSizeForSymbol,
  tradeSizeKindForSymbol,
  UNIT_CONTRACT_SIZE,
  type TradeSizeKind
} from '@shared/pricePrecision'

export type PositionSide = 'long' | 'short'

export type ExitReason = 'manual' | 'tp' | 'sl' | 'session_exit'

export type Position = {
  id: string
  side: PositionSide
  entryPrice: number
  entryTime: number
  /** Lots (FX/metals) or coin amount (crypto). */
  lots: number
  takeProfit: number | null
  stopLoss: number | null
  /** When this position filled from a limit, restore that pending on rewind. */
  pendingPlacedTime?: number | null
}

/** Unfilled Buy Limit (long) or Sell Limit (short). */
export type PendingOrder = {
  id: string
  side: PositionSide
  price: number
  placedTime: number
  lots: number
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
  lots: number
  pnl: number
  exitReason: ExitReason
  takeProfit: number | null
  stopLoss: number | null
  pendingPlacedTime?: number | null
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

/** Default reward multiple of risk (R:R = 1:DEFAULT_RISK_REWARD). */
export const DEFAULT_RISK_REWARD = 2

/** Paper size in lots (FX/metals) or coin amount (crypto). */
export const DEFAULT_LOTS = 1
/** Standard MT lot volume_min / volume_step. */
export const MIN_LOT_SIZE = 0.01
/** Common broker volume_max for a standard lot account. */
export const MAX_LOT_SIZE = 100
export const LOT_SIZE_STEP = 0.01
/** Smallest positive crypto amount we keep (no maximum). */
export const MIN_CRYPTO_SIZE = 1e-8
export const TRADE_SIZE_STEP = LOT_SIZE_STEP

export type PnlScale = {
  lots?: number
  contractSize?: number
}

export function clampTradeSize(value: number, kind: TradeSizeKind = 'lot'): number {
  if (!Number.isFinite(value)) return DEFAULT_LOTS
  if (kind === 'amount') {
    if (!(value > 0)) return MIN_CRYPTO_SIZE
    return Math.round(value * 1e8) / 1e8
  }
  const rounded = Math.round(value * 100) / 100
  return Math.min(MAX_LOT_SIZE, Math.max(MIN_LOT_SIZE, rounded))
}

export function clampTradeSizeForSymbol(value: number, symbol: string): number {
  return clampTradeSize(value, tradeSizeKindForSymbol(symbol))
}

export function formatTradeSize(value: number, kind: TradeSizeKind = 'lot'): string {
  const size = clampTradeSize(value, kind)
  if (kind === 'lot') return size.toFixed(2)
  const text = size.toFixed(8).replace(/\.?0+$/, '')
  return text.length ? text : '0'
}

export function formatTradeSizeForSymbol(value: number, symbol: string): string {
  return formatTradeSize(value, tradeSizeKindForSymbol(symbol))
}

/** History / overlay copy: `1.00 lot` for FX/metals, bare amount for crypto. */
export function formatPositionSize(lots: number | null | undefined, symbol: string): string {
  const size = formatTradeSizeForSymbol(resolvedLots(lots), symbol)
  return tradeSizeKindForSymbol(symbol) === 'lot' ? `${size} lot` : size
}

export function resolvedLots(lots: number | null | undefined): number {
  return lots != null && Number.isFinite(lots) && lots > 0 ? lots : DEFAULT_LOTS
}

export function pnlScaleForSymbol(symbol: string, lots = DEFAULT_LOTS): PnlScale {
  return { lots: resolvedLots(lots), contractSize: contractSizeForSymbol(symbol) }
}

function resolvePnlScale(scale?: PnlScale): { lots: number; contractSize: number } {
  return {
    lots: resolvedLots(scale?.lots),
    contractSize:
      scale?.contractSize != null && Number.isFinite(scale.contractSize) && scale.contractSize > 0
        ? scale.contractSize
        : UNIT_CONTRACT_SIZE
  }
}

/** Quote-currency P/L: price delta × contract size × lots. */
export function pnlForSide(
  side: PositionSide,
  entryPrice: number,
  markPrice: number,
  scale?: PnlScale
): number {
  const { lots, contractSize } = resolvePnlScale(scale)
  const delta = side === 'long' ? markPrice - entryPrice : entryPrice - markPrice
  return delta * contractSize * lots
}

/** Normalize a user R:R multiple (reward per 1R). */
export function clampRiskReward(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RISK_REWARD
  return Math.min(20, Math.max(0.5, Math.round(value * 10) / 10))
}

/** Format as `1:2` / `1:1.5`. */
export function formatRiskReward(riskReward: number): string {
  if (!Number.isFinite(riskReward) || riskReward <= 0) return '—'
  const rounded = Math.round(riskReward * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `1:${text}`
}

/**
 * TP from SL using entry risk × R:R.
 * Returns null when SL is not on the risk side of entry (e.g. lock-profit trail).
 */
export function takeProfitFromStopLoss(
  side: PositionSide,
  entryPrice: number,
  stopLoss: number,
  riskReward: number
): number | null {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(stopLoss) ||
    !Number.isFinite(riskReward) ||
    riskReward <= 0
  ) {
    return null
  }
  const risk = side === 'long' ? entryPrice - stopLoss : stopLoss - entryPrice
  if (!(risk > 0)) return null
  const reward = risk * riskReward
  return side === 'long' ? entryPrice + reward : entryPrice - reward
}

/**
 * SL from TP using entry reward ÷ R:R.
 * Returns null when TP is not on the profit side of entry.
 */
export function stopLossFromTakeProfit(
  side: PositionSide,
  entryPrice: number,
  takeProfit: number,
  riskReward: number
): number | null {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(takeProfit) ||
    !Number.isFinite(riskReward) ||
    riskReward <= 0
  ) {
    return null
  }
  const reward = side === 'long' ? takeProfit - entryPrice : entryPrice - takeProfit
  if (!(reward > 0)) return null
  const risk = reward / riskReward
  return side === 'long' ? entryPrice - risk : entryPrice + risk
}

/** Realized R:R from current levels, or null if not a classic risk setup. */
export function realizedRiskReward(
  side: PositionSide,
  entryPrice: number,
  stopLoss: number | null | undefined,
  takeProfit: number | null | undefined
): number | null {
  if (
    stopLoss == null ||
    takeProfit == null ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(stopLoss) ||
    !Number.isFinite(takeProfit)
  ) {
    return null
  }
  const risk = side === 'long' ? entryPrice - stopLoss : stopLoss - entryPrice
  const reward = side === 'long' ? takeProfit - entryPrice : entryPrice - takeProfit
  if (!(risk > 0) || !(reward > 0)) return null
  return reward / risk
}

export function isValidTakeProfit(side: PositionSide, entryPrice: number, price: number): boolean {
  if (!Number.isFinite(price)) return false
  if (side === 'long') return price > entryPrice
  return price < entryPrice
}

/** Buy Limit must sit below mark; Sell Limit must sit above mark. */
export function isValidLimitPrice(side: PositionSide, markPrice: number, price: number): boolean {
  if (!Number.isFinite(price) || !Number.isFinite(markPrice)) return false
  if (side === 'long') return price < markPrice
  return price > markPrice
}

/** Pending SL is classic risk vs the limit price (no lock-profit trail yet). */
export function isValidPendingStopLoss(
  side: PositionSide,
  entryPrice: number,
  price: number
): boolean {
  if (!Number.isFinite(price) || !Number.isFinite(entryPrice)) return false
  if (side === 'long') return price < entryPrice
  return price > entryPrice
}

export type TicketOrderType = 'market' | 'limit'

export type TicketDraftLevels = {
  orderType: TicketOrderType
  markPrice: number | null | undefined
  limitPrice: number | null | undefined
  takeProfit: number | null | undefined
  stopLoss: number | null | undefined
}

/** Entry used to validate TP/SL: limit price, or mark for a market ticket. */
export function ticketEntryPrice(levels: TicketDraftLevels): number | null {
  if (levels.orderType === 'limit') {
    return levels.limitPrice != null && Number.isFinite(levels.limitPrice) ? levels.limitPrice : null
  }
  return levels.markPrice != null && Number.isFinite(levels.markPrice) ? levels.markPrice : null
}

/**
 * Side implied by draft TP/SL vs entry. Null when both sides remain possible
 * or the levels conflict.
 */
export function inferTicketSide(levels: TicketDraftLevels): PositionSide | null {
  const longOk = canPlaceTicketSide('long', levels)
  const shortOk = canPlaceTicketSide('short', levels)
  if (longOk && !shortOk) return 'long'
  if (shortOk && !longOk) return 'short'
  return null
}

/** Whether Buy or Sell can be submitted with the current ticket drafts. */
export function canPlaceTicketSide(side: PositionSide, levels: TicketDraftLevels): boolean {
  const mark = levels.markPrice
  if (mark == null || !Number.isFinite(mark)) return false

  if (levels.orderType === 'limit') {
    const limit = levels.limitPrice
    if (limit == null || !Number.isFinite(limit)) return false
    if (!isValidLimitPrice(side, mark, limit)) return false
    if (levels.takeProfit != null && !isValidTakeProfit(side, limit, levels.takeProfit)) {
      return false
    }
    if (levels.stopLoss != null && !isValidPendingStopLoss(side, limit, levels.stopLoss)) {
      return false
    }
    return true
  }

  if (levels.takeProfit != null && !isValidTakeProfit(side, mark, levels.takeProfit)) {
    return false
  }
  if (levels.stopLoss != null && !isValidStopLoss(side, mark, levels.stopLoss)) {
    return false
  }
  return true
}

/**
 * Stop loss may sit anywhere on the protective side of the current mark,
 * including above entry for longs (or below for shorts) to lock profit.
 */
export function isValidStopLoss(side: PositionSide, markPrice: number, price: number): boolean {
  if (!Number.isFinite(price) || !Number.isFinite(markPrice)) return false
  if (side === 'long') return price < markPrice
  return price > markPrice
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
  price: number | null,
  markPrice?: number | null
): { ok: true; position: Position } | { ok: false; reason: string } {
  if (price == null) {
    return { ok: true, position: { ...position, stopLoss: null } }
  }
  if (markPrice == null || !Number.isFinite(markPrice)) {
    return { ok: false, reason: 'No market price' }
  }
  if (!isValidStopLoss(position.side, markPrice, price)) {
    return {
      ok: false,
      reason:
        position.side === 'long'
          ? 'Stop loss must be below current price'
          : 'Stop loss must be above current price'
    }
  }
  return { ok: true, position: { ...position, stopLoss: price } }
}

export function placePendingLimit(args: {
  current: Position | null
  pending: PendingOrder | null
  side: PositionSide
  price: number
  markPrice: number
  time: number
  id: string
  lots?: number
}): { ok: true; pending: PendingOrder } | { ok: false; reason: string } {
  const { current, pending, side, price, markPrice, time, id } = args
  if (side !== 'long' && side !== 'short') {
    return { ok: false, reason: 'Invalid side' }
  }
  if (current) {
    return { ok: false, reason: 'Close the open position first' }
  }
  if (pending) {
    return { ok: false, reason: 'Cancel the pending order first' }
  }
  if (!Number.isFinite(price) || !Number.isFinite(time) || !Number.isFinite(markPrice)) {
    return { ok: false, reason: 'Invalid limit' }
  }
  if (!isValidLimitPrice(side, markPrice, price)) {
    return {
      ok: false,
      reason:
        side === 'long'
          ? 'Buy Limit must be below current price'
          : 'Sell Limit must be above current price'
    }
  }
  return {
    ok: true,
    pending: {
      id,
      side,
      price,
      placedTime: time,
      lots: resolvedLots(args.lots),
      takeProfit: null,
      stopLoss: null
    }
  }
}

export function withPendingPrice(
  pending: PendingOrder,
  price: number,
  markPrice: number
): { ok: true; pending: PendingOrder } | { ok: false; reason: string } {
  if (!Number.isFinite(price) || !Number.isFinite(markPrice)) {
    return { ok: false, reason: 'Invalid limit' }
  }
  if (!isValidLimitPrice(pending.side, markPrice, price)) {
    return {
      ok: false,
      reason:
        pending.side === 'long'
          ? 'Buy Limit must be below current price'
          : 'Sell Limit must be above current price'
    }
  }
  let next: PendingOrder = { ...pending, price }
  if (next.takeProfit != null && !isValidTakeProfit(next.side, price, next.takeProfit)) {
    next = { ...next, takeProfit: null }
  }
  if (next.stopLoss != null && !isValidPendingStopLoss(next.side, price, next.stopLoss)) {
    next = { ...next, stopLoss: null }
  }
  return { ok: true, pending: next }
}

export function withPendingTakeProfit(
  pending: PendingOrder,
  price: number | null
): { ok: true; pending: PendingOrder } | { ok: false; reason: string } {
  if (price == null) {
    return { ok: true, pending: { ...pending, takeProfit: null } }
  }
  if (!isValidTakeProfit(pending.side, pending.price, price)) {
    return {
      ok: false,
      reason:
        pending.side === 'long'
          ? 'Take profit must be above limit'
          : 'Take profit must be below limit'
    }
  }
  return { ok: true, pending: { ...pending, takeProfit: price } }
}

export function withPendingStopLoss(
  pending: PendingOrder,
  price: number | null
): { ok: true; pending: PendingOrder } | { ok: false; reason: string } {
  if (price == null) {
    return { ok: true, pending: { ...pending, stopLoss: null } }
  }
  if (!isValidPendingStopLoss(pending.side, pending.price, price)) {
    return {
      ok: false,
      reason:
        pending.side === 'long' ? 'Stop loss must be below limit' : 'Stop loss must be above limit'
    }
  }
  return { ok: true, pending: { ...pending, stopLoss: price } }
}

/** True when this Replay candle trades through the pending limit. */
export function evaluatePendingFill(
  pending: PendingOrder,
  candle: Pick<Candle, 'high' | 'low' | 'close'>
): boolean {
  const { side, price } = pending
  const { high, low, close } = candle
  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
    return false
  }
  if (side === 'long') {
    return low <= price || close <= price
  }
  return high >= price || close >= price
}

export function pendingToPosition(pending: PendingOrder, fillTime: number): Position {
  return {
    id: pending.id,
    side: pending.side,
    entryPrice: pending.price,
    entryTime: fillTime,
    lots: resolvedLots(pending.lots),
    takeProfit: pending.takeProfit,
    stopLoss: pending.stopLoss,
    pendingPlacedTime: pending.placedTime
  }
}

function pendingFromFilledPosition(
  position: Position,
  currentCandleTime: number
): PendingOrder | null {
  const placed = position.pendingPlacedTime
  if (placed == null || !Number.isFinite(placed) || placed > currentCandleTime) return null
  return {
    id: position.id,
    side: position.side,
    price: position.entryPrice,
    placedTime: placed,
    lots: resolvedLots(position.lots),
    takeProfit: position.takeProfit,
    stopLoss: position.stopLoss
  }
}

export function openPosition(
  current: Position | null,
  side: PositionSide,
  price: number,
  time: number,
  id: string,
  lots: number = DEFAULT_LOTS,
  pendingPlacedTime?: number | null
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
      lots: resolvedLots(lots),
      takeProfit: null,
      stopLoss: null,
      pendingPlacedTime: pendingPlacedTime ?? null
    }
  }
}

/** Close the open position at mark price; returns realized trade. */
export function closePosition(
  position: Position,
  exitPrice: number,
  exitTime: number,
  exitReason: ExitReason = 'manual',
  scale?: PnlScale
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
    lots: resolvedLots(position.lots),
    pnl: pnlForSide(position.side, position.entryPrice, exitPrice, {
      lots: scale?.lots ?? position.lots,
      contractSize: scale?.contractSize
    }),
    exitReason,
    takeProfit: position.takeProfit,
    stopLoss: position.stopLoss,
    pendingPlacedTime: position.pendingPlacedTime ?? null
  }
}

/** Rebuild an open position from a closed trade (for replay rewind). */
export function positionFromClosedTrade(trade: ClosedTrade): Position {
  return {
    id: trade.id,
    side: trade.side,
    entryPrice: trade.entryPrice,
    entryTime: trade.entryTime,
    lots: resolvedLots(trade.lots),
    takeProfit: trade.takeProfit,
    stopLoss: trade.stopLoss,
    pendingPlacedTime: trade.pendingPlacedTime ?? null
  }
}

export type TradeRewindResult = {
  position: Position | null
  pendingOrder: PendingOrder | null
  closedTrades: ClosedTrade[]
  /** Entry times whose open markers should be removed (forgotten / reset). */
  discardedEntryTimes: number[]
}

/**
 * After stepping one candle backward from `leftCandleTime` to `currentCandleTime`:
 * - Reopen a trade closed on the left candle (if still at/after its entry).
 * - Restore a limit pending if rewind lands before fill but after place.
 * - Forget a trade entirely if rewind lands before its entry (reset decision).
 * - Drop an open position if current is before its entry.
 * - Drop a pending if current is before its place time.
 */
export function rewindTradesAfterStepBack(args: {
  position: Position | null
  pendingOrder?: PendingOrder | null
  closedTrades: ClosedTrade[]
  leftCandleTime: number
  currentCandleTime: number
}): TradeRewindResult {
  const { leftCandleTime, currentCandleTime } = args
  let position = args.position
  let pendingOrder = args.pendingOrder ?? null
  let closedTrades = Array.isArray(args.closedTrades) ? [...args.closedTrades] : []
  const discardedEntryTimes: number[] = []

  if (position && currentCandleTime < position.entryTime) {
    discardedEntryTimes.push(position.entryTime)
    pendingOrder = pendingFromFilledPosition(position, currentCandleTime)
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
        pendingOrder = null
      } else {
        const restored = pendingFromFilledPosition(
          positionFromClosedTrade(trade),
          currentCandleTime
        )
        if (restored) pendingOrder = restored
        discardedEntryTimes.push(trade.entryTime)
      }
    }
  }

  if (pendingOrder && currentCandleTime < pendingOrder.placedTime) {
    pendingOrder = null
  }

  return { position, pendingOrder, closedTrades, discardedEntryTimes }
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

  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
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
  markPrice: number | null | undefined,
  scale?: PnlScale
): number | null {
  if (!position || markPrice == null || !Number.isFinite(markPrice)) {
    return null
  }
  return pnlForSide(position.side, position.entryPrice, markPrice, {
    lots: scale?.lots ?? position.lots,
    contractSize: scale?.contractSize
  })
}

export function cumulativeRealizedPnl(closedTrades: ClosedTrade[]): number {
  if (!Array.isArray(closedTrades) || !closedTrades.length) return 0
  return closedTrades.reduce((sum, trade) => sum + trade.pnl, 0)
}

export function sessionPerformance(
  closedTrades: ClosedTrade[],
  open: Position | null,
  markPrice: number | null | undefined,
  scale?: PnlScale
): { realized: number; unrealized: number; total: number } {
  const realized = cumulativeRealizedPnl(closedTrades)
  const u = unrealizedPnl(open, markPrice, scale)
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

/** Chart overlay label, e.g. `+ 12.50 USD` / `- 3.10 USD`. */
export function formatPnlUsd(pnl: number | null | undefined): string {
  if (pnl == null || !Number.isFinite(pnl)) return '— USD'
  const abs = Math.abs(pnl).toFixed(2)
  if (pnl > 0) return `+ ${abs} USD`
  if (pnl < 0) return `- ${abs} USD`
  return `0.00 USD`
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
    'lots',
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
      resolvedLots(trade.lots),
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
