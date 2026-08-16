import { Check, ChevronDown, LineChart } from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import { INDICATORS } from '@/lib/indicators'
import { useReplayStore } from '@/store/replayStore'

export default function IndicatorsDropdown() {
  const activeIndicators = useReplayStore((s) => s.activeIndicators)
  const toggleIndicator = useReplayStore((s) => s.toggleIndicator)

  return (
    <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
      <Dropdown
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label="Indicators"
            aria-expanded={open}
            className={`inline-flex h-8 items-center gap-1.5 rounded border px-2 text-xs font-medium transition-colors ${
              open
                ? 'border-amber-500/70'
                : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
            }`}
          >
            <LineChart className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Indicators</span>
            {activeIndicators.length > 0 && (
              <span className="rounded bg-amber-500/20 px-1 text-[10px] leading-4 tabular-nums">
                {activeIndicators.length}
              </span>
            )}
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        )}
      >
        {INDICATORS.map((indicator) => {
          const active = activeIndicators.includes(indicator.id)
          return (
            <button
              key={indicator.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={active}
              onClick={() => toggleIndicator(indicator.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: indicator.color }}
                aria-hidden
              />
              <span className="flex-1 font-medium">{indicator.label}</span>
              <span className="flex w-4 shrink-0 items-center justify-center">
                {active && <Check className="h-3.5 w-3.5 text-amber-300" aria-hidden />}
              </span>
            </button>
          )
        })}
      </Dropdown>
    </div>
  )
}
