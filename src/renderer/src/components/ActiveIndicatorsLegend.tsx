import { X } from 'lucide-react'
import { getIndicator } from '@/lib/indicators'
import { useReplayStore } from '@/store/replayStore'

export default function ActiveIndicatorsLegend() {
  const activeIndicators = useReplayStore((s) => s.activeIndicators)
  const toggleIndicator = useReplayStore((s) => s.toggleIndicator)

  const rows = activeIndicators
    .map((id) => getIndicator(id))
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)

  if (rows.length === 0) return null

  return (
    <div className="flex flex-col items-start gap-0.5">
      {rows.map((indicator) => (
        <div
          key={indicator.id}
          className="pointer-events-auto flex items-center gap-1 rounded border border-zinc-800/80 bg-zinc-950/80 px-1.5 py-0.5 text-[11px] font-medium backdrop-blur-sm"
        >
          <span className="leading-4" style={{ color: indicator.color }}>
            {indicator.label}
          </span>
          <button
            type="button"
            aria-label={`Remove ${indicator.label}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              toggleIndicator(indicator.id)
            }}
            className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
