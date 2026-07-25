export type PositionSide = 'long' | 'short'

export type Position = {
  id: string
  side: PositionSide
  entryPrice: number
  entryTime: number
}

export type ClosedTrade = {
  id: string
  side: PositionSide
  entryPrice: number
  entryTime: number
  exitPrice: number
  exitTime: number
  pnl: number
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

export function pnlForSide(side: PositionSide, entryPrice: number, markPrice: number): number {
  if (side === 'long') return markPrice - entryPrice
  return entryPrice - markPrice
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
      entryTime: time
    }
  }
}

export function closePosition(
  position: Position,
  exitPrice: number,
  exitTime: number
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
    pnl: pnlForSide(position.side, position.entryPrice, exitPrice)
  }
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

export function tradesToCsv(closedTrades: ClosedTrade[]): string {
  const header = [
    'id',
    'side',
    'entryPrice',
    'entryTimeUtc',
    'exitPrice',
    'exitTimeUtc',
    'pnl'
  ].join(',')

  const rows = (Array.isArray(closedTrades) ? closedTrades : []).map((trade) =>
    [
      csvEscape(trade.id),
      trade.side,
      trade.entryPrice,
      toIsoUtc(trade.entryTime),
      trade.exitPrice,
      toIsoUtc(trade.exitTime),
      trade.pnl
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
