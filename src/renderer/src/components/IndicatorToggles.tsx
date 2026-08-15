import { LineChart } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { INDICATORS } from '@/lib/indicators'
import { useReplayStore } from '@/store/replayStore'

export default function IndicatorToggles() {
  const activeIndicators = useReplayStore((s) => s.activeIndicators)
  const toggleIndicator = useReplayStore((s) => s.toggleIndicator)

  return (
    <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
      <LineChart className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
      {INDICATORS.map((indicator) => {
        const active = activeIndicators.includes(indicator.id)
        return (
          <IconButton
            key={indicator.id}
            tooltip={`${active ? 'Hide' : 'Show'} ${indicator.label}`}
            active={active}
            onClick={() => toggleIndicator(indicator.id)}
            className="!w-auto px-2 text-[10px] font-semibold tracking-wide"
          >
            <span style={{ color: active ? indicator.color : undefined }}>{indicator.label}</span>
          </IconButton>
        )
      })}
    </div>
  )
}
