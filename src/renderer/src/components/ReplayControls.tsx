import { FormEvent, useState } from 'react'
import {
  ChevronsLeft,
  ChevronsRight,
  CirclePause,
  Gauge,
  LogOut,
  Pause,
  Play,
  SkipForward
} from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import IconButton from '@/components/IconButton'
import Tooltip from '@/components/Tooltip'
import { REPLAY_SPEEDS } from '@/lib/replayEngine'
import { defaultUtcParts, parseUtcParts, toUtcParts } from '@/lib/utcDateTime'
import { TIMEFRAMES } from '@shared/timeframes'
import { useReplayStore } from '@/store/replayStore'

export default function ReplayControls() {
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const isPlaying = useReplayStore((s) => s.isPlaying)
  const speed = useReplayStore((s) => s.speed)
  const replayIndex = useReplayStore((s) => s.replayIndex)
  const secondaryReplayIndex = useReplayStore((s) => s.secondaryReplayIndex)
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const driverPane = useReplayStore((s) => s.driverPane)
  const timeframe = useReplayStore((s) => s.timeframe)
  const secondaryTimeframe = useReplayStore((s) => s.secondaryTimeframe)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const secondaryLoading = useReplayStore((s) => s.secondaryLoading)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const play = useReplayStore((s) => s.play)
  const pause = useReplayStore((s) => s.pause)
  const stepForward = useReplayStore((s) => s.stepForward)
  const stepBackward = useReplayStore((s) => s.stepBackward)
  const setSpeed = useReplayStore((s) => s.setSpeed)
  const setDriverPane = useReplayStore((s) => s.setDriverPane)
  const jumpToTime = useReplayStore((s) => s.jumpToTime)
  const exitReplay = useReplayStore((s) => s.exitReplay)
  const pauseOnTpSl = useReplayStore((s) => s.pauseOnTpSl)
  const setPauseOnTpSl = useReplayStore((s) => s.setPauseOnTpSl)

  const seed = currentCandle ? toUtcParts(currentCandle.time) : defaultUtcParts(7)
  const [jumpDate, setJumpDate] = useState(seed.date)
  const [jumpTime, setJumpTime] = useState(seed.time)
  const [jumpError, setJumpError] = useState<string | null>(null)

  const busy = replayLoading || secondaryLoading
  const ended = replayStatus === 'ended'
  const driverIndex =
    chartSplit && driverPane === 'secondary' ? secondaryReplayIndex : replayIndex

  async function onJump(event: FormEvent): Promise<void> {
    event.preventDefault()
    setJumpError(null)

    const seconds = parseUtcParts(jumpDate, jumpTime)
    if (seconds == null) {
      setJumpError('Enter a valid UTC date and time.')
      return
    }

    await jumpToTime(seconds)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1">
        {!isPlaying ? (
          <IconButton
            tooltip="Play"
            disabled={busy || ended}
            onClick={play}
            tone="accent"
            tooltipSide="top"
            shortcut={['Space']}
          >
            <Play className="h-4 w-4 fill-current" />
          </IconButton>
        ) : (
          <IconButton
            tooltip="Pause"
            shortcut={['Space']}
            disabled={busy}
            onClick={pause}
            tone="accent"
            tooltipSide="top"
          >
            <Pause className="h-4 w-4 fill-current" />
          </IconButton>
        )}

        <IconButton
          tooltip="Step backward"
          shortcut={['ArrowLeft']}
          disabled={busy || driverIndex <= 0}
          onClick={stepBackward}
          tooltipSide="top"
        >
          <ChevronsLeft className="h-4 w-4" />
        </IconButton>

        <IconButton
          tooltip="Step forward"
          shortcut={['ArrowRight']}
          disabled={busy || ended}
          onClick={stepForward}
          tooltipSide="top"
        >
          <ChevronsRight className="h-4 w-4" />
        </IconButton>
      </div>

      {chartSplit && (
        <Tooltip text="Toggle next-candle pane" kbds={['Tab']} side="top">
          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              setDriverPane(driverPane === 'primary' ? 'secondary' : 'primary')
              event.currentTarget.blur()
            }}
            aria-label="Toggle next candle pane"
            className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/80 px-2 text-xs text-zinc-300 transition-colors enabled:hover:border-zinc-500 enabled:hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="text-zinc-500">Next</span>
            <span className="font-medium text-amber-300">
              {driverPane === 'secondary'
                ? `${TIMEFRAMES[secondaryTimeframe]?.label ?? secondaryTimeframe} · right`
                : `${TIMEFRAMES[timeframe]?.label ?? timeframe} · left`}
            </span>
          </button>
        </Tooltip>
      )}

      <label className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/80 px-2 text-xs text-zinc-400">
        <Gauge className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        <span className="sr-only">Speed</span>
        <select
          value={String(speed)}
          disabled={busy}
          aria-label="Playback speed"
          onChange={(e) => {
            setSpeed(Number(e.target.value))
            e.currentTarget.blur()
          }}
          className="rounded bg-zinc-900 text-zinc-100 outline-none disabled:opacity-60"
        >
          {REPLAY_SPEEDS.map((value) => (
            <option key={value} value={String(value)} className="bg-zinc-900 text-zinc-100">
              {value}x
            </option>
          ))}
        </select>
      </label>

      <IconButton
        tooltip="Pause after price hits TP or SL"
        active={pauseOnTpSl}
        pressed={pauseOnTpSl}
        tooltipSide="top"
        onClick={(event) => {
          setPauseOnTpSl(!pauseOnTpSl)
          event.currentTarget.blur()
        }}
      >
        <CirclePause className="h-4 w-4" />
      </IconButton>

      <Dropdown
        align="end"
        trigger={({ open, toggle }) => (
          <IconButton
            tooltip="Jump to UTC time"
            active={open}
            tooltipSide="top"
            disabled={busy}
            onClick={(event) => {
              toggle()
              event.currentTarget.blur()
            }}
          >
            <SkipForward className="h-4 w-4" />
          </IconButton>
        )}
      >
        <form onSubmit={onJump} className="flex items-center gap-1 p-2">
          <SkipForward className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
          <span className="sr-only">Jump UTC</span>
          <input
            type="date"
            value={jumpDate}
            disabled={busy}
            aria-label="Jump date UTC"
            onChange={(e) => setJumpDate(e.target.value)}
            className="h-8 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs text-zinc-300 disabled:opacity-60"
          />
          <input
            type="time"
            value={jumpTime}
            disabled={busy}
            aria-label="Jump time UTC"
            onChange={(e) => setJumpTime(e.target.value)}
            className="h-8 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs text-zinc-300 disabled:opacity-60"
          />
          <IconButton tooltip="Jump to UTC time" type="submit" tooltipSide="top" disabled={busy}>
            <SkipForward className="h-4 w-4" />
          </IconButton>
          {jumpError && <span className="text-xs text-red-400">{jumpError}</span>}
        </form>
      </Dropdown>

      <IconButton tooltip="Exit replay" onClick={exitReplay} tooltipSide="top" className="ml-0.5">
        <LogOut className="h-4 w-4" />
      </IconButton>
    </div>
  )
}
