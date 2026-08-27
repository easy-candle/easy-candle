import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  formatExitReason,
  formatOrderSideLabel,
  formatOrderStatus,
  formatPnl,
  formatPositionSize,
  formatRiskReward,
  pnlScaleForSymbol,
  realizedRiskReward,
  sessionPerformance,
  unrealizedPnl,
  type ClosedTrade,
  type HistoricOrder,
  type PendingOrder,
  type Position
} from '@/lib/paperTrade'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { formatAssetPrice } from '@shared/pricePrecision'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { useReplayStore, selectPriceFollowCandle } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import Tooltip from '@/components/Tooltip'

type HistoryTab = 'positions' | 'openOrders' | 'orderHistory' | 'positionHistory'

const TABS: { id: HistoryTab; label: string }[] = [
  { id: 'positions', label: 'Positions' },
  { id: 'openOrders', label: 'Open Orders' },
  { id: 'orderHistory', label: 'Order History' },
  { id: 'positionHistory', label: 'Position History' }
]

function tabClass(active: boolean): string {
  return `shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
    active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'
  }`
}

function sideClass(side: 'long' | 'short', muted = false): string {
  if (side === 'long')
    return muted ? 'font-semibold text-emerald-400/90' : 'font-semibold text-emerald-400'
  return muted ? 'font-semibold text-red-400/90' : 'font-semibold text-red-400'
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="py-1.5 text-[11px] text-zinc-600">{children}</p>
}

function HistoryList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-zinc-800/80 text-[11px]">{children}</ul>
}

function PendingOrderRow({
  order,
  symbol,
  pricePrecision
}: {
  order: PendingOrder
  symbol: string
  pricePrecision: number
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 tabular-nums">
      <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">
        Working
      </span>
      <span className={sideClass(order.side)}>
        {order.side === 'long' ? 'BUY LIMIT' : 'SELL LIMIT'}
      </span>
      <span className="text-zinc-500">{formatPositionSize(order.lots, symbol)}</span>
      <span className="text-zinc-400">
        Limit {formatAssetPrice(order.price, pricePrecision)} ·{' '}
        {formatUtcCandleTime(order.placedTime)}
      </span>
      {order.takeProfit != null && (
        <span className="text-teal-400/90">
          TP {formatAssetPrice(order.takeProfit, pricePrecision)}
        </span>
      )}
      {order.stopLoss != null && (
        <span className="text-orange-400/90">
          SL {formatAssetPrice(order.stopLoss, pricePrecision)}
        </span>
      )}
    </li>
  )
}

function OpenPositionRow({
  position,
  symbol,
  pricePrecision,
  openPnl,
  openRr,
  rrLabel
}: {
  position: Position
  symbol: string
  pricePrecision: number
  openPnl: number | null
  openRr: number | null
  rrLabel: string
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 tabular-nums">
      <span className="rounded bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
        Open
      </span>
      <span className={sideClass(position.side)}>{position.side.toUpperCase()}</span>
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
  )
}

function HistoricOrderRow({
  order,
  symbol,
  pricePrecision
}: {
  order: HistoricOrder
  symbol: string
  pricePrecision: number
}) {
  const canceled = order.status === 'canceled'
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 tabular-nums text-zinc-400">
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          canceled ? 'bg-zinc-900 text-zinc-500' : 'bg-zinc-900 text-emerald-400/80'
        }`}
      >
        {formatOrderStatus(order.status)}
      </span>
      <span className={sideClass(order.side, true)}>
        {formatOrderSideLabel(order.side, order.type)}
      </span>
      <span className="text-zinc-500">{formatPositionSize(order.lots, symbol)}</span>
      <span>
        {formatAssetPrice(order.price, pricePrecision)}
        {canceled ? ' · canceled' : ''}
      </span>
      <span className="text-zinc-600">
        {formatUtcCandleTime(order.placedTime)}
        {order.updateTime !== order.placedTime ? ` → ${formatUtcCandleTime(order.updateTime)}` : ''}
      </span>
      {order.takeProfit != null && (
        <span className="text-teal-400/80">
          TP {formatAssetPrice(order.takeProfit, pricePrecision)}
        </span>
      )}
      {order.stopLoss != null && (
        <span className="text-orange-400/80">
          SL {formatAssetPrice(order.stopLoss, pricePrecision)}
        </span>
      )}
    </li>
  )
}

function ClosedPositionRow({
  trade,
  symbol,
  pricePrecision
}: {
  trade: ClosedTrade
  symbol: string
  pricePrecision: number
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 tabular-nums text-zinc-400">
      <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Closed
      </span>
      <span className={sideClass(trade.side, true)}>{trade.side.toUpperCase()}</span>
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
        className={`ml-auto font-medium ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
      >
        {formatPnl(trade.pnl)}
      </span>
    </li>
  )
}

/** Session PnL + Positions / Open Orders / Order History / Position History. */
export default function TradePanel() {
  const [showPositions, setShowPositions] = useState(true)
  const [tab, setTab] = useState<HistoryTab>('positions')
  const mode = useReplayStore((s) => s.mode)
  const position = useReplayStore((s) => s.position)
  const pendingOrder = useReplayStore((s) => s.pendingOrder)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const orderHistory = useReplayStore((s) => s.orderHistory)
  const currentCandle = useReplayStore(selectPriceFollowCandle)
  const riskReward = useReplayStore((s) => s.riskReward)
  const tradeSize = useReplayStore((s) => s.tradeSize)
  const pricePrecision = usePricePrecision()
  const symbol = useReplayStore((s) => s.symbol)
  const preview = useUiLayoutStore((s) => s.tourPaperTradePreview)

  if (mode !== 'replay' && !preview) return null

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

  const counts: Record<HistoryTab, number> = {
    positions: position ? 1 : 0,
    openOrders: pendingOrder ? 1 : 0,
    orderHistory: orderHistory.length,
    positionHistory: closedTrades.length
  }

  const howTo = (
    <EmptyRow>
      Use the order ticket to Buy or Sell at market, or place a Buy/Sell Limit. Size is lots for
      FX/metals and coin amount for crypto. Type TP/SL in the ticket or drag on the chart. First
      SL/TP placement seeds the other at {rrLabel} as a guide — then move either level freely.
    </EmptyRow>
  )

  const neverTraded =
    !position && !pendingOrder && orderHistory.length === 0 && closedTrades.length === 0

  let body: ReactNode
  if (tab === 'positions') {
    body = position ? (
      <HistoryList>
        <OpenPositionRow
          position={position}
          symbol={symbol}
          pricePrecision={pricePrecision}
          openPnl={openPnl}
          openRr={openRr}
          rrLabel={rrLabel}
        />
      </HistoryList>
    ) : neverTraded ? (
      howTo
    ) : (
      <EmptyRow>No open positions</EmptyRow>
    )
  } else if (tab === 'openOrders') {
    body = pendingOrder ? (
      <HistoryList>
        <PendingOrderRow order={pendingOrder} symbol={symbol} pricePrecision={pricePrecision} />
      </HistoryList>
    ) : (
      <EmptyRow>No open orders. Place a Buy Limit or Sell Limit from the ticket.</EmptyRow>
    )
  } else if (tab === 'orderHistory') {
    body =
      orderHistory.length > 0 ? (
        <HistoryList>
          {[...orderHistory].reverse().map((order) => (
            <HistoricOrderRow
              key={`${order.id}-${order.status}-${order.updateTime}`}
              order={order}
              symbol={symbol}
              pricePrecision={pricePrecision}
            />
          ))}
        </HistoryList>
      ) : (
        <EmptyRow>No order history yet. Filled and canceled orders show here.</EmptyRow>
      )
  } else {
    body =
      closedTrades.length > 0 ? (
        <HistoryList>
          {[...closedTrades].reverse().map((trade) => (
            <ClosedPositionRow
              key={`${trade.id}-${trade.exitTime}`}
              trade={trade}
              symbol={symbol}
              pricePrecision={pricePrecision}
            />
          ))}
        </HistoryList>
      ) : (
        <EmptyRow>No closed positions yet.</EmptyRow>
      )
  }

  return (
    <div
      inert={preview || undefined}
      className={`mt-1.5 shrink-0 rounded-sm border border-zinc-800 bg-zinc-950/90 ${
        preview ? 'pointer-events-none' : ''
      }`}
    >
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
          <Tooltip text={showPositions ? 'Hide trade history' : 'Show trade history'} side="top">
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
        <>
          <div
            role="tablist"
            aria-label="Trade history"
            className="flex gap-0.5 overflow-x-auto border-b border-zinc-800/80 px-2 py-1"
          >
            {TABS.map((item) => {
              const active = tab === item.id
              const count = counts[item.id]
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={tabClass(active)}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                  <span
                    className={`ml-1 tabular-nums ${active ? 'text-zinc-400' : 'text-zinc-600'}`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="max-h-36 overflow-y-auto px-3 py-1.5">{body}</div>
        </>
      )}
    </div>
  )
}
