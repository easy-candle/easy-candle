import { Clock3 } from 'lucide-react'
import { TIMEFRAME_IDS, TIMEFRAMES } from '@shared/timeframes'
import { useReplayStore } from '@/store/replayStore'

export default function TimeframeSelect() {
  const timeframe = useReplayStore((s) => s.timeframe)
  const status = useReplayStore((s) => s.status)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const setTimeframe = useReplayStore((s) => s.setTimeframe)
  const disabled = status === 'loading' || replayLoading

  return (
    <label className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/80 px-2 text-xs text-zinc-400">
      <Clock3 className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
      <span className="sr-only">Timeframe</span>
      <select
        className="rounded bg-zinc-900 text-zinc-100 outline-none disabled:opacity-60"
        value={timeframe}
        disabled={disabled}
        aria-label="Timeframe"
        onChange={(event) => setTimeframe(event.target.value)}
      >
        {TIMEFRAME_IDS.map((id) => (
          <option key={id} value={id} className="bg-zinc-900 text-zinc-100">
            {TIMEFRAMES[id].label}
          </option>
        ))}
      </select>
    </label>
  )
}
