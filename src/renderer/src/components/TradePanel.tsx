import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import {
  formatExitReason,
  formatPnl,
  formatPositionSize,
  formatRiskReward,
  pnlScaleForSymbol,
  realizedRiskReward,
  sessionPerformance,
  unrealizedPnl
} from '@/lib/paperTrade'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { formatAssetPrice } from '@shared/pricePrecision'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { useReplayStore } from '@/store/replayStore'
import Tooltip from '@/components/Tooltip'

/** Session PnL + open/pending/closed list. Submit lives in the right-column ticket. */
export default function TradePanel() {
  const [showPositions, setShowPositions] = useState(true)
  const mode = useReplayStore((s) => s.mode)
  const position = useReplayStore((s) => s.position)
  const pendingOrder = useReplayStore((s) => s.pendingOrder)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const riskReward = useReplayStore((s) => s.riskReward)
  const tradeSize = useReplayStore((s) => s.tradeSize)
  const pricePrecision = usePricePrecision()
  const symbol = useReplayStore((s) => s.symbol)

  if (mode !== 'replay') return null

  const mark = currentCandle?.close
  const scale = pnlScaleForSymbol(symbol, position?.lots ?? tradeSize)
  const openPnl = unrealizedPnl(position, mark, scale)
  const perf = sessionPerformance(closedTrades, position, mark, scale)
  const rrLabel = formatRiskReward(riskReward)
  const openRr =
    position != null
      ? realizedRiskReward(
          position.side,
          position.entryPrice,
          position.stopLoss,
          position.takeProfit
        )
      : null
  const empty = !position && !pendingOrder && closedTrades.length === 0

  return (
    <div className="mt-1.5 shrink-0 rounded-sm border border-zinc-800 bg-zinc-950/90">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Paper trade</span>

        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] tabular-nums">
          <span className="text-zinc-500">
            Realized{' '}
            <span className={perf.realized >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {formatPnl(perf.realized)}
            </span>
          </span>
          <span className="text-zinc-500">
            Open{' '}
            <span
              className={
                openPnl == null
                  ? 'text-zinc-600'
                  : openPnl >= 0
                    ? 'text-emerald-400'
                    : 'text-red-400'
              }
            >
              {formatPnl(openPnl)}
            </span>
          </span>
          <span className="font-medium text-zinc-300">
            Session{' '}
            <span className={perf.total >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {formatPnl(perf.total)}
            </span>
          </span>
          <Tooltip text={showPositions ? 'Hide positions list' : 'Show positions list'} side="top">
            <button
              type="button"
              onClick={() => setShowPositions((v) => !v)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
            >
              {showPositions ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronUp className="h-5 w-5" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>

      {showPositions && (
        <div className="max-h-36 overflow-y-auto px-3 py-1.5">
          {empty ? (
            <p className="py-1.5 text-[11px] text-zinc-600">
              Use the order ticket to Buy or Sell at market, or place a Buy/Sell Limit. Size is lots
              for FX/metals and coin amount for crypto. Type TP/SL in the ticket or drag on the
              chart. First SL/TP placement seeds the other at {rrLabel} as a guide — then move
              either level freely.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800/80 text-[11px]">
              {pendingOrder && (
                <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 tabular-nums">
                  <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">
                    Pending
                  </span>
                  <span
                    className={
                      pendingOrder.side === 'long'
                        ? 'font-semibold text-emerald-400'
                        : 'font-semibold text-red-400'
                    }
                  >
                    {pendingOrder.side === 'long' ? 'BUY LIMIT' : 'SELL LIMIT'}
                  </span>
                  <span className="text-zinc-500">
                    {formatPositionSize(pendingOrder.lots, symbol)}
                  </span>
                  <span className="text-zinc-400">
                    Limit {formatAssetPrice(pendingOrder.price, pricePrecision)} ·{' '}
                    {formatUtcCandleTime(pendingOrder.placedTime)}
                  </span>
                  {pendingOrder.takeProfit != null && (
                    <span className="text-teal-400/90">
                      TP {formatAssetPrice(pendingOrder.takeProfit, pricePrecision)}
                    </span>
                  )}
                  {pendingOrder.stopLoss != null && (
                    <span className="text-orange-400/90">
                      SL {formatAssetPrice(pendingOrder.stopLoss, pricePrecision)}
                    </span>
                  )}
                </li>
              )}

              {position && (
                <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 tabular-nums">
                  <span className="rounded bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                    Open
                  </span>
                  <span
                    className={
                      position.side === 'long'
                        ? 'font-semibold text-emerald-400'
                        : 'font-semibold text-red-400'
                    }
                  >
                    {position.side.toUpperCase()}
                  </span>
                  <span className="text-zinc-500">{formatPositionSize(position.lots, symbol)}</span>
                  <span className="text-zinc-400">
                    Entry {formatAssetPrice(position.entryPrice, pricePrecision)} ·{' '}
                    {formatUtcCandleTime(position.entryTime)}
                  </span>
                  {position.takeProfit != null && (
                    <span className="text-teal-400/90">
                      TP {formatAssetPrice(position.takeProfit, pricePrecision)}
                      {openRr != null ? ` · ${formatRiskReward(openRr)}` : ` · ${rrLabel}`}
                    </span>
                  )}
                  {position.stopLoss != null && (
                    <span className="text-orange-400/90">
                      SL {formatAssetPrice(position.stopLoss, pricePrecision)}
                    </span>
                  )}
                  <span
                    className={`ml-auto font-medium ${
                      openPnl != null && openPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {formatPnl(openPnl)}
                  </span>
                </li>
              )}

              {[...closedTrades].reverse().map((trade) => (
                <li
                  key={`${trade.id}-${trade.exitTime}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 tabular-nums text-zinc-400"
                >
                  <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Closed
                  </span>
                  <span
                    className={
                      trade.side === 'long'
                        ? 'font-semibold text-emerald-400/90'
                        : 'font-semibold text-red-400/90'
                    }
                  >
                    {trade.side.toUpperCase()}
                  </span>
                  <span className="text-zinc-500">{formatPositionSize(trade.lots, symbol)}</span>
                  <span className="rounded bg-zinc-900/80 px-1 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                    {formatExitReason(trade.exitReason)}
                  </span>
                  <span>
                    {formatAssetPrice(trade.entryPrice, pricePrecision)} →{' '}
                    {formatAssetPrice(trade.exitPrice, pricePrecision)}
                  </span>
                  <span className="text-zinc-600">
                    {formatUtcCandleTime(trade.entryTime)} → {formatUtcCandleTime(trade.exitTime)}
                  </span>
                  <span
                    className={`ml-auto font-medium ${
                      trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {formatPnl(trade.pnl)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
