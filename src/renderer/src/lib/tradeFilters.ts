import type { ClosedTrade, PositionSide } from '@/lib/paperTrade'
import { filterBySessions, sessionsAt, type TradingSessionId } from '@/lib/tradingSessions'

export const TRADE_SIDES: readonly PositionSide[] = ['long', 'short']

/** Buy/Sell wording, which traders read faster than long/short in a report. */
export function tradeSideLabel(side: PositionSide): string {
  return side === 'long' ? 'Buy' : 'Sell'
}

/**
 * Report filters. An empty array means "no filter" for that dimension, so the
 * default state passes every trade through.
 */
export type TradeFilters = {
  sessions: TradingSessionId[]
  sides: PositionSide[]
}

export const EMPTY_TRADE_FILTERS: TradeFilters = { sessions: [], sides: [] }

export function hasActiveFilters(filters: TradeFilters): boolean {
  return filters.sessions.length > 0 || filters.sides.length > 0
}

export function filterBySides(trades: ClosedTrade[], sides: PositionSide[]): ClosedTrade[] {
  const list = Array.isArray(trades) ? trades : []
  if (!Array.isArray(sides) || sides.length === 0) return list

  const wanted = new Set(sides)
  return list.filter((trade) => wanted.has(trade.side))
}

/** Both dimensions are ANDed: a trade must match the session and the side. */
export function applyTradeFilters(trades: ClosedTrade[], filters: TradeFilters): ClosedTrade[] {
  const bySession = filterBySessions(trades, filters.sessions, (trade) => trade.entryTime)
  return filterBySides(bySession, filters.sides)
}

export function countBySide(trades: ClosedTrade[]): Record<PositionSide, number> {
  const counts: Record<PositionSide, number> = { long: 0, short: 0 }
  for (const trade of Array.isArray(trades) ? trades : []) {
    if (trade.side === 'long' || trade.side === 'short') counts[trade.side] += 1
  }
  return counts
}

/**
 * Counts for one dimension's options while the *other* dimension stays applied,
 * so a badge shows what selecting that option would actually yield.
 */
export function sessionCountsUnderFilters(
  trades: ClosedTrade[],
  filters: TradeFilters
): Record<TradingSessionId, number> {
  const scoped = filterBySides(trades, filters.sides)
  const counts: Record<TradingSessionId, number> = {
    sydney: 0,
    tokyo: 0,
    london: 0,
    newYork: 0
  }
  for (const trade of scoped) {
    for (const id of sessionsAt(trade.entryTime)) counts[id] += 1
  }
  return counts
}

export function sideCountsUnderFilters(
  trades: ClosedTrade[],
  filters: TradeFilters
): Record<PositionSide, number> {
  return countBySide(filterBySessions(trades, filters.sessions, (trade) => trade.entryTime))
}
