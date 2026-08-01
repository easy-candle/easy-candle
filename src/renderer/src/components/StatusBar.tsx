import { Circle, LoaderCircle } from 'lucide-react'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { useReplayStore } from '@/store/replayStore'

function replayLabel(status: string): string {
  switch (status) {
    case 'ready':
      return 'Ready'
    case 'playing':
      return 'Playing'
    case 'paused':
      return 'Paused'
    case 'ended':
      return 'Ended'
    case 'idle':
      return 'Idle'
    default:
      return String(status)
  }
}

export default function StatusBar() {
  const status = useReplayStore((s) => s.status)
  const error = useReplayStore((s) => s.error)
  const candles = useReplayStore((s) => s.candles)
  const mode = useReplayStore((s) => s.mode)
  const dataSource = useReplayStore((s) => s.dataSource)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const isPlaying = useReplayStore((s) => s.isPlaying)
  const speed = useReplayStore((s) => s.speed)
  const replayIndex = useReplayStore((s) => s.replayIndex)
  const bufferLength = useReplayStore((s) => s.bufferLength)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const isPrefetching = useReplayStore((s) => s.isPrefetching)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const replayMessage = useReplayStore((s) => s.replayMessage)
  const imported = dataSource === 'imported'

  if (mode === 'replay') {
    const ended = replayStatus === 'ended'
    const parts = [
      imported ? 'Imported' : null,
      replayLabel(replayStatus),
      isPlaying ? `${speed}x` : null,
      formatUtcCandleTime(currentCandle?.time),
      bufferLength > 0 ? `${replayIndex + 1}/${bufferLength}` : '0/0'
    ].filter(Boolean)

    return (
      <div className="ml-auto flex min-w-0 flex-col items-end gap-0.5 text-[11px] text-zinc-500">
        <span
          className={`inline-flex items-center gap-1.5 font-medium tabular-nums ${
            ended ? 'text-amber-400/90' : 'text-zinc-400'
          }`}
        >
          <Circle
            className={`h-2 w-2 fill-current ${
              isPlaying ? 'text-emerald-400' : ended ? 'text-amber-400' : 'text-zinc-600'
            }`}
            aria-hidden
          />
          {parts.join(' · ')}
          {(replayLoading || isPrefetching) && (
            <LoaderCircle className="h-3 w-3 animate-spin text-zinc-500" aria-hidden />
          )}
        </span>
        {ended && !replayMessage && (
          <span className="text-amber-400/80">
            {imported
              ? 'End of imported file — jump within range or step back.'
              : 'End of buffer — jump, step back, or wait for prefetch.'}
          </span>
        )}
        {replayMessage && <span className="text-amber-400/90">{replayMessage}</span>}
        {!ended && <span className="text-zinc-600">Space: {isPlaying ? 'pause' : 'step'}</span>}
      </div>
    )
  }

  return (
    <div className="ml-auto inline-flex items-center gap-1.5 text-[11px] tabular-nums text-zinc-500">
      {status === 'loading' && (
        <>
          <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
          <span>Loading…</span>
        </>
      )}
      {status === 'ready' && candles.length === 0 && (
        <span className="text-zinc-400">No candles returned</span>
      )}
      {status === 'ready' && candles.length > 0 && (
        <span className={imported ? 'text-amber-400/90' : undefined}>
          {replayMessage ||
            `${imported ? 'Imported · ' : ''}${candles.length.toLocaleString()} candles`}
        </span>
      )}
      {status === 'error' && <span className="text-red-400">{error || 'Load failed'}</span>}
      {status === 'idle' && <span>Waiting to load…</span>}
    </div>
  )
}
