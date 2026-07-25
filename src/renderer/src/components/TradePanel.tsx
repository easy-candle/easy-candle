import { ArrowDownCircle, ArrowUpCircle, CircleX } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { formatPnl, sessionPerformance, unrealizedPnl } from '@/lib/paperTrade'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { useReplayStore } from '@/store/replayStore'

export default function TradePanel() {
  const mode = useReplayStore((s) => s.mode)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const position = useReplayStore((s) => s.position)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const paperBuy = useReplayStore((s) => s.paperBuy)
  const paperSell = useReplayStore((s) => s.paperSell)
  const paperClose = useReplayStore((s) => s.paperClose)

  if (mode !== 'replay') return null

  const busy = replayLoading || replayStatus === 'ended' || !currentCandle
  const mark = currentCandle?.close
  const openPnl = unrealizedPnl(position, mark)
  const perf = sessionPerformance(closedTrades, position, mark)
  const canOpen = !busy && !position
  const canClose = !busy && Boolean(position)

  return (
    <div className="mt-1.5 shrink-0 rounded-sm border border-zinc-800 bg-zinc-950/90">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Paper trade</span>

        <div className="flex items-center gap-1">
          <IconButton
            label="Long — open long (when flat)"
            disabled={!canOpen}
            onClick={paperBuy}
            tone="success"
            active
            className="!w-auto gap-1 px-2.5"
          >
            <ArrowUpCircle className="h-4 w-4" />
            <span className="text-xs font-semibold">LONG</span>
          </IconButton>
          <IconButton
            label="Short — open short (when flat)"
            disabled={!canOpen}
            onClick={paperSell}
            tone="danger"
            active
            className="!w-auto gap-1 px-2.5"
          >
            <ArrowDownCircle className="h-4 w-4" />
            <span className="text-xs font-semibold">SHORT</span>
          </IconButton>
          <IconButton
            label="Close open position at current close"
            disabled={!canClose}
            onClick={paperClose}
            tone="accent"
            className="!w-auto gap-1 px-2.5"
          >
            <CircleX className="h-4 w-4" />
            <span className="text-xs font-semibold">Close</span>
          </IconButton>
        </div>

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
        </div>
      </div>

      <div className="max-h-36 overflow-y-auto px-3 py-1.5">
        {!position && closedTrades.length === 0 ? (
          <p className="py-1.5 text-[11px] text-zinc-600">
            No trades this replay. Open LONG or SHORT at the current candle close (1 unit). Close to
            realize PnL. Resets on exit / refresh.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800/80 text-[11px]">
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
                <span className="text-zinc-400">
                  Entry {position.entryPrice.toFixed(2)} · {formatUtcCandleTime(position.entryTime)}
                </span>
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
        )}
      </div>
    </div>
  )
}
