import type { ReactNode } from 'react'
import { BadgeInfo, Circle, LoaderCircle } from 'lucide-react'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import type { ReplayStatus } from '@/lib/replayEngine'
import { useReplayStore } from '@/store/replayStore'
import { isMetatraderImport } from '@shared/datasetTypes'
import Tooltip from '@/components/Tooltip'

const SEPARATOR = ' · '

const REPLAY_LABELS: Record<ReplayStatus, string> = {
  idle: 'Idle',
  ready: 'Ready',
  playing: 'Playing',
  paused: 'Paused',
  ended: 'Ended'
}

const END_MESSAGES = {
  imported: 'End of imported file — jump within range or step back.',
  buffer: 'End of buffer — jump, step back, or wait for prefetch.'
} as const

function replayLabel(status: ReplayStatus): string {
  return REPLAY_LABELS[status]
}

function splitMessage(message: string | null): { mode: string | undefined; text: string } {
  if (!message) return { mode: undefined, text: '' }
  const [mode, ...rest] = message.split(SEPARATOR)
  return { mode, text: rest.join(SEPARATOR) }
}

function compact(parts: Array<string | null>): string[] {
  return parts.filter((part): part is string => Boolean(part))
}

function StatusPill({ tone, children }: { tone: 'default' | 'warn'; children: ReactNode }) {
  const toneClass = tone === 'warn' ? 'text-amber-400/90' : 'text-zinc-400'
  return (
    <span className={`inline-flex items-center gap-1.5 bg-zinc-950 p-1.5 font-medium tabular-nums ${toneClass}`}>
      {children}
    </span>
  )
}

function StatusDot({ isPlaying, ended }: { isPlaying: boolean; ended: boolean }) {
  const dotClass = isPlaying ? 'text-emerald-400' : ended ? 'text-amber-400' : 'text-zinc-600'
  return <Circle className={`h-2 w-2 fill-current ${dotClass}`} aria-hidden />
}

function LiveStatus() {
  const status = useReplayStore((s) => s.status)
  const error = useReplayStore((s) => s.error)
  const candles = useReplayStore((s) => s.candles)
  const dataSource = useReplayStore((s) => s.dataSource)
  const replayMessage = useReplayStore((s) => s.replayMessage)
  const importMeta = useReplayStore((s) => s.importMeta)
  const imported = dataSource === 'imported'
  const mtbridge = dataSource === 'mtbridge'
  const mtFeed = mtbridge || isMetatraderImport(importMeta)

  const candlesLabel =
    replayMessage ??
    `${imported ? (mtFeed ? 'MetaTrader' : 'Imported') + SEPARATOR : ''}${candles.length.toLocaleString()} candles`

  return (
    <div className="ml-auto inline-flex items-center gap-1.5 text-[11px] tabular-nums text-zinc-500">
      {status === 'loading' && (
        <>
          <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
          <span>Loading…</span>
        </>
      )}
      {status === 'ready' && candles.length === 0 && !mtbridge && (
        <span className="text-zinc-400">No candles returned</span>
      )}
      {status === 'ready' && candles.length > 0 && (
        <span className={imported || mtbridge ? 'text-amber-400/90' : undefined}>{candlesLabel}</span>
      )}
      {status === 'idle' && mtbridge && <span className="max-w-[28rem] truncate">{replayMessage}</span>}
      {status === 'error' && <span className="text-red-400">{error || 'Load failed'}</span>}
      {status === 'idle' && !mtbridge && <span>Waiting to load…</span>}
    </div>
  )
}

function ReplayStatus() {
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const isPlaying = useReplayStore((s) => s.isPlaying)
  const speed = useReplayStore((s) => s.speed)
  const replayIndex = useReplayStore((s) => s.replayIndex)
  const bufferLength = useReplayStore((s) => s.bufferLength)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const isPrefetching = useReplayStore((s) => s.isPrefetching)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const replayMessage = useReplayStore((s) => s.replayMessage)
  const dataSource = useReplayStore((s) => s.dataSource)
  const importMeta = useReplayStore((s) => s.importMeta)
  const imported = dataSource === 'imported'
  const mtFeed = dataSource === 'mtbridge' || isMetatraderImport(importMeta)

  const ended = replayStatus === 'ended'
  const busy = replayLoading || isPrefetching
  const speedLabel = isPlaying ? `(${speed}x)` : null
  const details = compact([
    imported ? (mtFeed ? 'MetaTrader' : 'Imported') : null,
    isPlaying ? `${speed}x` : null,
    formatUtcCandleTime(currentCandle?.time),
    bufferLength > 0 ? `${replayIndex + 1}/${bufferLength}` : '0/0'
  ])
  const { mode, text } = splitMessage(replayMessage)

  return (
    <div className="ml-auto flex min-w-0 items-center gap-1 text-[11px] text-zinc-500">
      <Tooltip text={details.join(SEPARATOR)} side="bottom">
        <StatusPill tone={ended ? 'warn' : 'default'}>
          <StatusDot isPlaying={isPlaying} ended={ended} />
          {replayLabel(replayStatus)} {speedLabel}
          {busy && <LoaderCircle className="h-3 w-3 animate-spin text-zinc-500" aria-hidden />}
        </StatusPill>
      </Tooltip>

      {ended && !replayMessage && (
        <span className="text-amber-400/80">
          {imported ? END_MESSAGES.imported : END_MESSAGES.buffer}
        </span>
      )}

      {replayMessage && (
        <Tooltip text={text} side="bottom">
          <StatusPill tone="warn">
            <span className="max-w-full truncate capitalize">{mode}</span>
            <BadgeInfo className="h-3 w-3" strokeWidth={3} />
          </StatusPill>
        </Tooltip>
      )}
    </div>
  )
}

export default function StatusBar() {
  const mode = useReplayStore((s) => s.mode)
  return mode === 'replay' ? <ReplayStatus /> : <LiveStatus />
}
