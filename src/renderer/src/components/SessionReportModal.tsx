import { useEffect } from 'react'
import { Download, X } from 'lucide-react'
import { formatExitReason, formatPnl, formatWinRate, tradesToCsv, type SideReport } from '@/lib/paperTrade'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { useReplayStore } from '@/store/replayStore'

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

export default function SessionReportModal() {
  const sessionReport = useReplayStore((s) => s.sessionReport)
  const dismissSessionReport = useReplayStore((s) => s.dismissSessionReport)

  useEffect(() => {
    if (!sessionReport) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        dismissSessionReport()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sessionReport, dismissSessionReport])

  if (!sessionReport) return null

  const { symbol, timeframe, trades, summary, closedOpenOnExit } = sessionReport

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={dismissSessionReport}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-report-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 id="session-report-title" className="text-sm font-semibold text-amber-400">
              Session performance
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {symbol} · {timeframe} · {trades.length} closed trade
              {trades.length === 1 ? '' : 's'}
              {closedOpenOnExit ? ' · open position closed at exit' : null}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close report"
            onClick={dismissSessionReport}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-4 flex flex-col gap-4 border-b border-zinc-800/80 pb-4 sm:flex-row">
            <ReportBlock title="Overall" report={summary.overall} />
            <div className="hidden w-px bg-zinc-800 sm:block" aria-hidden />
            <ReportBlock title="Long" report={summary.long} />
            <div className="hidden w-px bg-zinc-800 sm:block" aria-hidden />
            <ReportBlock title="Short" report={summary.short} />
          </div>

          <h3 className="mb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Trades</h3>
          <ul className="divide-y divide-zinc-800/80 text-[11px]">
            {trades.map((trade) => (
              <li
                key={`${trade.id}-${trade.exitTime}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 tabular-nums text-zinc-400"
              >
                <span
                  className={
                    trade.side === 'long'
                      ? 'font-semibold text-emerald-400/90'
                      : 'font-semibold text-red-400/90'
                  }
                >
                  {trade.side.toUpperCase()}
                </span>
                <span className="rounded bg-zinc-900/80 px-1 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                  {formatExitReason(trade.exitReason)}
                </span>
                <span>
                  {trade.entryPrice.toFixed(2)} → {trade.exitPrice.toFixed(2)}
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
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:text-zinc-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export CSV
          </button>
          <button
            type="button"
            onClick={dismissSessionReport}
            className="inline-flex h-8 items-center rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
