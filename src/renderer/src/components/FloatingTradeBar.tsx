import { ArrowDownCircle, ArrowUpCircle, CircleX, Minus, Plus } from 'lucide-react'
import FloatingPanel from '@/components/FloatingPanel'
import IconButton from '@/components/IconButton'
import TradeSizeControl from '@/components/TradeSizeControl'
import { formatPnl, formatPositionSize, formatRiskReward, pnlScaleForSymbol, unrealizedPnl } from '@/lib/paperTrade'
import { formatAssetPrice } from '@shared/pricePrecision'
import { usePricePrecision } from '@/hooks/usePricePrecision'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

const RR_PRESETS = [1, 1.5, 2, 3] as const

/** Compact Long/Short/Close + R:R for fullscreen replay (no trade history). */
export default function FloatingTradeBar() {
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const position = useReplayStore((s) => s.position)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const riskReward = useReplayStore((s) => s.riskReward)
  const paperBuy = useReplayStore((s) => s.paperBuy)
  const paperSell = useReplayStore((s) => s.paperSell)
  const paperClose = useReplayStore((s) => s.paperClose)
  const setRiskReward = useReplayStore((s) => s.setRiskReward)
  const tradeSize = useReplayStore((s) => s.tradeSize)
  const setTradeSize = useReplayStore((s) => s.setTradeSize)
  const pricePrecision = usePricePrecision()
  const symbol = useReplayStore((s) => s.symbol)

  const pos = useUiLayoutStore((s) => s.tradePanelPos)
  const setTradePanelPos = useUiLayoutStore((s) => s.setTradePanelPos)

  const busy = replayLoading || replayStatus === 'ended' || !currentCandle
  const mark = currentCandle?.close
  const openPnl = unrealizedPnl(position, mark, pnlScaleForSymbol(symbol, position?.lots ?? tradeSize))
  const canOpen = !busy && !position
  const canClose = !busy && Boolean(position)
  const rrLabel = formatRiskReward(riskReward)

  return (
    <FloatingPanel
      title="Trade"
      pos={pos}
      onPosChange={setTradePanelPos}
      defaultPlacement="top-right"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1">
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
          <TradeSizeControl
            value={position?.lots ?? tradeSize}
            symbol={symbol}
            disabled={!canOpen}
            onChange={setTradeSize}
          />
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
          className="flex flex-wrap items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5"
          title="R:R guide for first SL/TP placement"
        >
          <span className="px-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            R:R
          </span>
          <IconButton tooltip="Decrease risk:reward" onClick={() => setRiskReward(riskReward - 0.5)} className="!h-6 !w-6">
            <Minus className="h-3 w-3" />
          </IconButton>
          <span className="min-w-[2.75rem] text-center text-xs font-semibold tabular-nums text-zinc-200">
            {rrLabel}
          </span>
          <IconButton tooltip="Increase risk:reward" onClick={() => setRiskReward(riskReward + 0.5)} className="!h-6 !w-6">
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

        {position && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] tabular-nums">
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
            <span className="text-zinc-500">
              @ {formatAssetPrice(position.entryPrice, pricePrecision)}
            </span>
            <span
              className={`ml-auto font-medium ${
                openPnl != null && openPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {formatPnl(openPnl)}
            </span>
          </div>
        )}
      </div>
    </FloatingPanel>
  )
}
