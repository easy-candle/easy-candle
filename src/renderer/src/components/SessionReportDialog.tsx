import { useEffect, useMemo, useState } from 'react'
import { Download, X } from 'lucide-react'
import EquityCurveChart from '@/components/EquityCurveChart'
import MultiSelectFilter, { type FilterOption } from '@/components/MultiSelectFilter'
import {
  formatExitReason,
  formatPnl,
  formatPositionSize,
  formatWinRate,
  summarizeSession,
  tradesToCsv,
  type ClosedTrade,
  type PositionSide,
  type SideReport
} from '@/lib/paperTrade'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import {
  TRADING_SESSIONS,
  sessionsAt,
  tradingSessionHours,
  tradingSessionLabel,
  type TradingSessionId
} from '@/lib/tradingSessions'
import {
  applyTradeFilters,
  EMPTY_TRADE_FILTERS,
  hasActiveFilters,
  sessionCountsUnderFilters,
  sideCountsUnderFilters,
  tradeSideLabel,
  TRADE_SIDES,
  type TradeFilters
} from '@/lib/tradeFilters'
import { formatAssetPrice, resolvePricePrecision } from '@shared/pricePrecision'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

type ReportTab = 'summary' | 'curve' | 'trades'

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'curve', label: 'Account curve' },
  { id: 'trades', label: 'Trades' }
]

function tabClass(active: boolean): string {
  return `shrink-0 rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
    active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'
  }`
}

function ReportBlock({ title, report }: { title: string; report: SideReport }) {
  return (
    <section className="min-w-0 flex-1">
      <h3 className="mb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] tabular-nums">
        <div>
          <dt className="text-zinc-600">Trades</dt>
          <dd className="text-zinc-200">{report.count}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">Win rate</dt>
          <dd className="text-zinc-200">{formatWinRate(report.winRate)}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">Wins / losses</dt>
          <dd className="text-zinc-200">
            {report.wins} / {report.losses}
            {report.breakeven > 0 ? (
              <span className="text-zinc-600"> · {report.breakeven} BE</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-600">Total PnL</dt>
          <dd className={report.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {formatPnl(report.totalPnl)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-600">Max profit</dt>
          <dd className="text-emerald-400">{formatPnl(report.maxProfit)}</dd>
        </div>
        <div>
          <dt className="text-zinc-600">Max loss</dt>
          <dd className="text-red-400">{formatPnl(report.maxLoss)}</dd>
        </div>
      </dl>
    </section>
  )
}

/** Sessions a trade was entered in, as short badges. */
function SessionBadges({ time }: { time: number }) {
  const ids = sessionsAt(time)
  if (ids.length === 0) return null
  return (
    <span className="flex shrink-0 gap-1">
      {ids.map((id) => (
        <span
          key={id}
          className="rounded bg-zinc-900/80 px-1 py-0.5 text-[9px] uppercase tracking-wide text-zinc-500"
        >
          {tradingSessionLabel(id)}
        </span>
      ))}
    </span>
  )
}

function TradeRow({
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
      <SessionBadges time={trade.entryTime} />
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

export default function SessionReportDialog() {
  const sessionReport = useReplayStore((s) => s.sessionReport)
  const dismissSessionReport = useReplayStore((s) => s.dismissSessionReport)
  const previewSessionReport = useUiLayoutStore((s) => s.previewSessionReport)
  const setPreviewSessionReport = useUiLayoutStore((s) => s.setPreviewSessionReport)

  const [tab, setTab] = useState<ReportTab>('summary')
  const [filters, setFilters] = useState<TradeFilters>(EMPTY_TRADE_FILTERS)

  const report = sessionReport ?? previewSessionReport
  const allTrades = report?.trades ?? []

  const trades = useMemo(() => applyTradeFilters(allTrades, filters), [allTrades, filters])
  // Recomputed from the filtered set, so the stats describe what is on screen.
  const summary = useMemo(() => summarizeSession(trades), [trades])

  // Each dimension's badges count under the *other* dimension's selection, so a
  // badge previews what picking that option would actually yield.
  const sessionOptions = useMemo<FilterOption<TradingSessionId>[]>(() => {
    const counts = sessionCountsUnderFilters(allTrades, filters)
    return TRADING_SESSIONS.map((session) => ({
      id: session.id,
      label: session.label,
      hint: tradingSessionHours(session.id),
      count: counts[session.id]
    }))
  }, [allTrades, filters])

  const sideOptions = useMemo<FilterOption<PositionSide>[]>(() => {
    const counts = sideCountsUnderFilters(allTrades, filters)
    return TRADE_SIDES.map((side) => ({
      id: side,
      label: tradeSideLabel(side),
      hint: side === 'long' ? 'Long' : 'Short',
      count: counts[side]
    }))
  }, [allTrades, filters])

  function dismiss(): void {
    if (sessionReport) {
      dismissSessionReport()
    } else {
      setPreviewSessionReport(null)
    }
  }

  // Reset the view whenever a different report opens. Derived during render
  // rather than in an effect, matching SessionManagerDialog.
  const [shownReport, setShownReport] = useState(report)
  if (report !== shownReport) {
    setShownReport(report)
    if (report) {
      setTab('summary')
      setFilters(EMPTY_TRADE_FILTERS)
    }
  }

  useEffect(() => {
    if (!report) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        dismiss()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [report, dismiss])

  if (!report) return null

  const { symbol, timeframe, closedOpenOnExit } = report
  const filtered = hasActiveFilters(filters)
  const pricePrecision = resolvePricePrecision(
    symbol,
    allTrades.map((trade) => ({
      open: trade.entryPrice,
      high: trade.entryPrice,
      low: trade.exitPrice,
      close: trade.exitPrice
    }))
  )

  function exportCsv(): void {
    const csv = tradesToCsv(trades)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const link = document.createElement('a')
    link.href = url
    link.download = `easy-candle-${symbol}-${timeframe}-${stamp}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-report-title"
        className="flex max-h-[min(calc(100vh-3rem),900px)] w-full max-w-2xl flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0">
            <h2 id="session-report-title" className="text-sm font-semibold text-amber-400">
              Session performance
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {symbol} · {timeframe} ·{' '}
              {filtered
                ? `${trades.length} of ${allTrades.length} closed trades`
                : `${allTrades.length} closed trade${allTrades.length === 1 ? '' : 's'}`}
              {closedOpenOnExit ? ' · open position closed at exit' : null}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close report"
            onClick={dismiss}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 px-3 py-1.5">
          <div role="tablist" aria-label="Report sections" className="flex gap-0.5">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={tabClass(tab === item.id)}
                onClick={() => setTab(item.id)}
              >
                {item.label}
                {item.id === 'trades' && (
                  <span
                    className={`ml-1 tabular-nums ${
                      tab === item.id ? 'text-zinc-400' : 'text-zinc-600'
                    }`}
                  >
                    {trades.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <MultiSelectFilter
              title="Direction"
              allLabel="Buy & sell"
              itemNoun="directions"
              menuClassName="w-44"
              options={sideOptions}
              selected={filters.sides}
              onChange={(sides) => setFilters((current) => ({ ...current, sides }))}
            />
            <MultiSelectFilter
              title="Trading session (UTC)"
              allLabel="All sessions"
              itemNoun="sessions"
              options={sessionOptions}
              selected={filters.sessions}
              onChange={(sessions) => setFilters((current) => ({ ...current, sessions }))}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {trades.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-zinc-600">
              {allTrades.length === 0
                ? 'No closed trades in this session.'
                : 'No trades match the current filters.'}
            </p>
          ) : tab === 'summary' ? (
            <div className="flex flex-col gap-4 sm:flex-row">
              <ReportBlock title="Overall" report={summary.overall} />
              <div className="hidden w-px bg-zinc-800 sm:block" aria-hidden />
              <ReportBlock title="Long" report={summary.long} />
              <div className="hidden w-px bg-zinc-800 sm:block" aria-hidden />
              <ReportBlock title="Short" report={summary.short} />
            </div>
          ) : tab === 'curve' ? (
            <EquityCurveChart trades={trades} />
          ) : (
            <ul className="divide-y divide-zinc-800/80 text-[11px]">
              {trades.map((trade) => (
                <TradeRow
                  key={`${trade.id}-${trade.exitTime}`}
                  trade={trade}
                  symbol={symbol}
                  pricePrecision={pricePrecision}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={exportCsv}
            disabled={trades.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-200 enabled:hover:border-zinc-500 enabled:hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export CSV{filtered ? ' (filtered)' : ''}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-8 items-center rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
