import { FormEvent, useState } from 'react'
import { CalendarClock, Dices, Play } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { REPLAY_FORWARD_BARS } from '@/lib/binance'
import {
  clampRandomLength,
  DEFAULT_RANDOM_LENGTH,
  pickRandomImportedStartIndex,
  pickRandomLiveStart,
  RANDOM_LENGTH_PRESETS,
  RANDOM_LOOKBACK_DAYS,
  type ReplayRangeMode
} from '@/lib/randomReplayRange'
import { defaultUtcParts, formatUtcCandleTime, parseUtcParts } from '@/lib/utcDateTime'
import { TIMEFRAMES } from '@shared/timeframes'
import { useReplayStore } from '@/store/replayStore'

export default function ReplayStartPicker() {
  const status = useReplayStore((s) => s.status)
  const mode = useReplayStore((s) => s.mode)
  const dataSource = useReplayStore((s) => s.dataSource)
  const candles = useReplayStore((s) => s.candles)
  const importedCandles = useReplayStore((s) => s.importedCandles)
  const timeframe = useReplayStore((s) => s.timeframe)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const startReplayAt = useReplayStore((s) => s.startReplayAt)
  const startImportedReplay = useReplayStore((s) => s.startImportedReplay)
  const startImportedReplayAt = useReplayStore((s) => s.startImportedReplayAt)

  const initial = defaultUtcParts(7)
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)
  const [rangeMode, setRangeMode] = useState<ReplayRangeMode>('manual')
  const [randomLength, setRandomLength] = useState(DEFAULT_RANDOM_LENGTH)
  const [localError, setLocalError] = useState<string | null>(null)

  const disabled = status === 'loading' || replayLoading || mode === 'replay'
  const imported = dataSource === 'imported'
  const canStart = status === 'ready' && candles.length > 0
  const length = clampRandomLength(randomLength)

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setLocalError(null)

    if (rangeMode === 'random') {
      if (imported) {
        const startIndex = pickRandomImportedStartIndex({
          candleCount: importedCandles.length,
          lengthCandles: length
        })
        if (startIndex == null) {
          setLocalError('Not enough imported candles for a random range.')
          return
        }
        const candle = importedCandles[startIndex]
        const when = candle ? formatUtcCandleTime(candle.time) : `candle ${startIndex + 1}`
        startImportedReplayAt(startIndex, {
          message: `Random replay · ${length} bars · start ${when}`
        })
        return
      }

      const intervalSeconds = TIMEFRAMES[timeframe]?.seconds ?? 900
      const startSec = pickRandomLiveStart({
        nowSeconds: Math.floor(Date.now() / 1000),
        intervalSeconds,
        lengthCandles: length
      })
      if (startSec == null) {
        setLocalError('Could not pick a random start in the lookback window.')
        return
      }

      await startReplayAt(startSec, {
        forwardBars: Math.max(REPLAY_FORWARD_BARS, length),
        message: `Random replay · ${length} bars · start ${formatUtcCandleTime(startSec)}`
      })
      return
    }

    if (imported) {
      startImportedReplay()
      return
    }

    const seconds = parseUtcParts(date, time)
    if (seconds == null) {
      setLocalError('Enter a valid UTC date and time.')
      return
    }

    await startReplayAt(seconds)
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
      <label className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/80 px-2 text-xs text-zinc-400">
        <span className="sr-only">Replay range mode</span>
        <select
          value={rangeMode}
          disabled={disabled}
          aria-label="Replay range mode"
          onChange={(e) => {
            setRangeMode(e.target.value as ReplayRangeMode)
            setLocalError(null)
            e.currentTarget.blur()
          }}
          className="rounded bg-zinc-900 text-zinc-100 outline-none disabled:opacity-60"
        >
          <option value="manual" className="bg-zinc-900 text-zinc-100">
            Manual
          </option>
          <option value="random" className="bg-zinc-900 text-zinc-100">
            Random
          </option>
        </select>
      </label>

      {rangeMode === 'manual' && !imported && (
        <>
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
        </>
      )}

      {rangeMode === 'manual' && imported && (
        <span className="text-[11px] uppercase tracking-wide text-amber-500/80">
          Replay from file start
        </span>
      )}

      {rangeMode === 'random' && (
        <>
          <Dices className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
          <label className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/80 px-2 text-xs text-zinc-400">
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">Length</span>
            <select
              value={String(length)}
              disabled={disabled}
              aria-label="Random replay length in candles"
              onChange={(e) => {
                setRandomLength(clampRandomLength(e.target.value))
                e.currentTarget.blur()
              }}
              className="rounded bg-zinc-900 text-zinc-100 outline-none disabled:opacity-60"
            >
              {RANDOM_LENGTH_PRESETS.map((value) => (
                <option key={value} value={String(value)} className="bg-zinc-900 text-zinc-100">
                  {value}
                </option>
              ))}
            </select>
          </label>
          <span className="text-[11px] text-zinc-600">
            {imported
              ? 'Random start in file'
              : `Random start in last ${RANDOM_LOOKBACK_DAYS === 365 ? '1y' : `${RANDOM_LOOKBACK_DAYS}d`}`}
          </span>
        </>
      )}

      <IconButton
        tooltip={
          imported && rangeMode === 'manual'
            ? 'Start replay from beginning of imported file'
            : rangeMode === 'random'
              ? 'Start replay at a random range'
              : replayLoading && mode !== 'replay'
                ? 'Loading replay window'
                : 'Start replay'
        }
        type="submit"
        disabled={disabled || !canStart}
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
