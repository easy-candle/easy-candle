import { FormEvent, useState } from 'react'
import { CalendarClock, Play } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { defaultUtcParts, parseUtcParts } from '@/lib/utcDateTime'
import { useReplayStore } from '@/store/replayStore'

export default function ReplayStartPicker() {
  const status = useReplayStore((s) => s.status)
  const mode = useReplayStore((s) => s.mode)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const startReplayAt = useReplayStore((s) => s.startReplayAt)

  const initial = defaultUtcParts(7)
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)
  const [localError, setLocalError] = useState<string | null>(null)

  const disabled = status === 'loading' || replayLoading || mode === 'replay'

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setLocalError(null)

    const seconds = parseUtcParts(date, time)
    if (seconds == null) {
      setLocalError('Enter a valid UTC date and time.')
      return
    }

    await startReplayAt(seconds)
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400"
    >
      <CalendarClock className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
      <span className="text-[11px] uppercase tracking-wide text-zinc-500">Replay UTC</span>
      <input
        type="date"
        value={date}
        disabled={disabled}
        aria-label="Replay start date UTC"
        onChange={(e) => setDate(e.target.value)}
        className="h-8 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-zinc-300 disabled:opacity-60"
      />
      <input
        type="time"
        value={time}
        disabled={disabled}
        aria-label="Replay start time UTC"
        onChange={(e) => setTime(e.target.value)}
        className="h-8 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-zinc-300 disabled:opacity-60"
      />
      <IconButton
        label={
          replayLoading && mode !== 'replay' ? 'Loading replay window' : 'Start replay'
        }
        type="submit"
        disabled={disabled || status !== 'ready'}
        tone="accent"
        className="!w-auto gap-1.5 px-2.5"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        <span className="text-xs font-medium">
          {replayLoading && mode !== 'replay' ? '…' : 'Replay'}
        </span>
      </IconButton>

      {localError && <span className="text-xs text-red-400">{localError}</span>}
    </form>
  )
}
