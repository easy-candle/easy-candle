import {
  ChevronUp,
  ArrowDownCircle,
  ChevronDown,
  ArrowUpCircle,
  CircleX,
  Minus,
  Plus
} from 'lucide-react'
import { useState } from 'react'
import IconButton from '@/components/IconButton'
import {
  formatExitReason,
  formatPnl,
  formatRiskReward,
  realizedRiskReward,
  sessionPerformance,
  unrealizedPnl
} from '@/lib/paperTrade'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { formatAssetPrice } from '@shared/pricePrecision'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { useReplayStore } from '@/store/replayStore'
import Tooltip from "@/components/Tooltip";

const RR_PRESETS = [1, 1.5, 2, 3] as const

export default function TradePanel() {
  const [showPositions, setShowPositions] = useState(true)
  const mode = useReplayStore((s) => s.mode)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const position = useReplayStore((s) => s.position)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const riskReward = useReplayStore((s) => s.riskReward)
  const paperBuy = useReplayStore((s) => s.paperBuy)
  const paperSell = useReplayStore((s) => s.paperSell)
  const paperClose = useReplayStore((s) => s.paperClose)
  const setRiskReward = useReplayStore((s) => s.setRiskReward)
  const pricePrecision = usePricePrecision()

  if (mode !== 'replay') return null

  const busy = replayLoading || replayStatus === 'ended' || !currentCandle
  const mark = currentCandle?.close
  const openPnl = unrealizedPnl(position, mark)
  const perf = sessionPerformance(closedTrades, position, mark)
  const canOpen = !busy && !position
  const canClose = !busy && Boolean(position)
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

  function nudgeRr(delta: number): void {
    setRiskReward(riskReward + delta)
  }

  return (
    <div className="mt-1.5 shrink-0 rounded-sm border border-zinc-800 bg-zinc-950/90">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Paper trade</span>

        <div className="flex items-center gap-1">
          <IconButton
            tooltip="Long — open long (when flat)"
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
            tooltip="Short — open short (when flat)"
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
            tooltip="Close open position at current close"
            disabled={!canClose}
            onClick={paperClose}
            tone="accent"
            className="!w-auto gap-1 px-2.5"
          >
            <CircleX className="h-4 w-4" />
            <span className="text-xs font-semibold">Close</span>
          </IconButton>
        </div>

        <div
          className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5"
          title="R:R guide for first SL/TP placement and when you change this value. After that you can drag levels freely."
        >
          <span className="px-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            R:R
          </span>
          <IconButton
            tooltip="Decrease risk:reward"
            onClick={() => nudgeRr(-0.5)}
            className="!h-6 !w-6"
          >
            <Minus className="h-3 w-3" />
          </IconButton>
          <span className="min-w-[2.75rem] text-center text-xs font-semibold tabular-nums text-zinc-200">
            {rrLabel}
          </span>
          <IconButton
            tooltip="Increase risk:reward"
            onClick={() => nudgeRr(0.5)}
            className="!h-6 !w-6"
          >
            <Plus className="h-3 w-3" />
          </IconButton>
          <div className="ml-0.5 flex items-center gap-0.5 border-l border-zinc-800 pl-1.5">
            {RR_PRESETS.map((preset) => {
              const active = riskReward === preset
              return (
                <button
                  key={preset}
                  type="button"
                  title={`Set R:R to 1:${preset}`}
                  aria-label={`Set R:R to 1:${preset}`}
                  aria-pressed={active}
                  onClick={() => setRiskReward(preset)}
                  className={`h-6 min-w-6 rounded px-1 text-[10px] font-semibold tabular-nums transition-colors ${
                    active
                      ? 'bg-amber-950/60 text-amber-300'
                      : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  {preset}
                </button>
              )
            })}
          </div>
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
          {!position && closedTrades.length === 0 ? (
            <p className="py-1.5 text-[11px] text-zinc-600">
              Open LONG or SHORT at the current close (1 unit). First SL/TP drag seeds the other at{' '}
              {rrLabel} as a guide — then move either level freely. Candle advances leave levels
              put.
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
