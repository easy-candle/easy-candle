import { Minus, Plus } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { formatRiskReward } from '@/lib/paperTrade'
import { useReplayStore } from '@/store/replayStore'

const RR_PRESETS = [1, 1.5, 2, 3] as const

export default function RiskRewardControl({ compact = false }: { compact?: boolean }) {
  const riskReward = useReplayStore((s) => s.riskReward)
  const setRiskReward = useReplayStore((s) => s.setRiskReward)
  const rrLabel = formatRiskReward(riskReward)

  return (
    <div
      className={`flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 ${
        compact ? 'flex-wrap' : ''
      }`}
      title="R:R guide for first SL/TP placement and when you change this value. After that you can drag levels freely."
    >
      <span className="px-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        R:R
      </span>
      <IconButton
        tooltip="Decrease risk:reward"
        onClick={() => setRiskReward(riskReward - 0.5)}
        className="!h-6 !w-6"
      >
        <Minus className="h-3 w-3" />
      </IconButton>
      <span className="min-w-[2.75rem] text-center text-xs font-semibold tabular-nums text-zinc-200">
        {rrLabel}
      </span>
      <IconButton
        tooltip="Increase risk:reward"
        onClick={() => setRiskReward(riskReward + 0.5)}
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
  )
}
