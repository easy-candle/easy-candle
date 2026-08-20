import { Minus, Plus } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { clampRiskReward, formatRiskReward } from '@/lib/paperTrade'
import { useReplayStore } from '@/store/replayStore'

const RR_PRESETS = [1, 1.5, 2, 3] as const
const RR_STEP = 0.5

export default function RiskRewardControl() {
  const riskReward = useReplayStore((s) => s.riskReward)
  const setRiskReward = useReplayStore((s) => s.setRiskReward)
  const rrLabel = formatRiskReward(riskReward)
  const atMin = riskReward <= 0.5
  const atMax = riskReward >= 20

  return (
    <div
      className="flex flex-col gap-1 rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-1"
      title="R:R guide for first SL/TP placement and when you change this value. After that you can drag levels freely."
    >
      <div className="flex items-center gap-1">
        <span className="px-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          R:R
        </span>
        <IconButton
          tooltip="Decrease risk:reward"
          disabled={atMin}
          onClick={() => setRiskReward(riskReward - RR_STEP)}
          className="!h-6 !w-6"
        >
          <Minus className="h-3 w-3" />
        </IconButton>
        <span className="min-w-0 flex-1 text-center text-xs font-semibold tabular-nums text-zinc-200">
          {rrLabel}
        </span>
        <IconButton
          tooltip="Increase risk:reward"
          disabled={atMax}
          onClick={() => setRiskReward(riskReward + RR_STEP)}
          className="!h-6 !w-6"
        >
          <Plus className="h-3 w-3" />
        </IconButton>
      </div>
      <div className="flex gap-0.5">
        {RR_PRESETS.map((preset) => {
          const active = riskReward === preset
          return (
            <button
              key={preset}
              type="button"
              title={`Set R:R to ${formatRiskReward(preset)}`}
              aria-label={`Set R:R to ${formatRiskReward(preset)}`}
              aria-pressed={active}
              onClick={() => setRiskReward(clampRiskReward(preset))}
              className={`h-6 min-w-0 flex-1 rounded text-[10px] font-semibold tabular-nums transition-colors ${
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
