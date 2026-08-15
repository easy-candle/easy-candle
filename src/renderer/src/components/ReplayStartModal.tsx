import { FormEvent, useEffect, useState } from 'react'
import { CalendarClock, Dices, Play, X } from 'lucide-react'
import IconButton from '@/components/IconButton'
import { REPLAY_FORWARD_BARS } from '@/lib/binance'
import {
  DEFAULT_RANGE,
  pickRandomImportedStartIndex,
  pickRandomLiveStart,
  RANDOM_LOOKBACK_DAYS,
  RANDOM_RANGE_PRESETS,
  RANGE_UNITS,
  RANGE_UNIT_LABELS,
  rangeToCandles,
  rangeToSeconds,
  type RandomRangePreset,
  type RangeUnit,
  type ReplayRangeMode
} from '@/lib/randomReplayRange'
import {
  defaultUtcParts,
  formatUtcCandleTime,
  nowUtcSeconds,
  parseUtcParts,
  toUtcParts
} from '@/lib/utcDateTime'
import { TIMEFRAMES } from '@shared/timeframes'
import { useReplayStore } from '@/store/replayStore'

const TAB_STORAGE_KEY = 'easy-candle:replay-modal-tab'

function loadTab(): ReplayRangeMode {
  try {
    return localStorage.getItem(TAB_STORAGE_KEY) === 'random' ? 'random' : 'manual'
  } catch {
    return 'manual'
  }
}

function persistTab(tab: ReplayRangeMode): void {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab)
  } catch {
    // ignore quota / private mode
  }
}

export default function ReplayStartModal() {
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

  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<ReplayRangeMode>(() => loadTab())
  const [date, setDate] = useState(() => defaultUtcParts(7).date)
  const [time, setTime] = useState(() => defaultUtcParts(7).time)
  const [rangeValue, setRangeValue] = useState(DEFAULT_RANGE.value)
  const [rangeUnit, setRangeUnit] = useState<RangeUnit>(DEFAULT_RANGE.unit)
  const [localError, setLocalError] = useState<string | null>(null)

  const disabled = status === 'loading' || replayLoading || mode === 'replay'
  const imported = dataSource === 'imported'
  const canStart = status === 'ready' && candles.length > 0
  const intervalSeconds = TIMEFRAMES[timeframe]?.seconds ?? 900

  useEffect(() => {
    if (!open) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function openModal(): void {
    const parts = defaultUtcParts(7)
    setDate(parts.date)
    setTime(parts.time)
    setLocalError(null)
    setOpen(true)
  }

  function selectTab(next: ReplayRangeMode): void {
    setTab(next)
    setLocalError(null)
    persistTab(next)
  }

  async function startRandom(value: number, unit: RangeUnit): Promise<boolean> {
    setLocalError(null)
    const lengthCandles = rangeToCandles(value, unit, intervalSeconds)
    if (lengthCandles <= 0) {
      setLocalError('Enter a valid range length.')
      return false
    }

    if (imported) {
      if (lengthCandles > importedCandles.length) {
        setLocalError(
          `Range (${lengthCandles.toLocaleString()} candles) exceeds the imported data (${importedCandles.length.toLocaleString()} candles).`
        )
        return false
      }
      const startIndex = pickRandomImportedStartIndex({
        candleCount: importedCandles.length,
        lengthCandles
      })
      if (startIndex == null) {
        setLocalError('Not enough imported candles for a random range.')
        return false
      }
      const candle = importedCandles[startIndex]
      const when = candle ? formatUtcCandleTime(candle.time) : `candle ${startIndex + 1}`
      startImportedReplayAt(startIndex, {
        message: `Random replay · ${value} ${RANGE_UNIT_LABELS[unit]} · start ${when}`
      })
      return true
    }

    if (rangeToSeconds(value, unit) > RANDOM_LOOKBACK_DAYS * 86400) {
      setLocalError(`Range exceeds available history (last ${RANDOM_LOOKBACK_DAYS} days).`)
      return false
    }

    const startSec = pickRandomLiveStart({
      nowSeconds: nowUtcSeconds(),
      intervalSeconds,
      lengthCandles
    })
    if (startSec == null) {
      setLocalError('Could not pick a random start in the lookback window.')
      return false
    }

    await startReplayAt(startSec, {
      forwardBars: Math.max(REPLAY_FORWARD_BARS, lengthCandles),
      message: `Random replay · ${value} ${RANGE_UNIT_LABELS[unit]} · start ${formatUtcCandleTime(startSec)}`
    })
    return true
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setLocalError(null)

    if (tab === 'random') {
      const ok = await startRandom(rangeValue, rangeUnit)
      if (ok) setOpen(false)
      return
    }

    if (imported) {
      startImportedReplay()
      setOpen(false)
      return
    }

    const seconds = parseUtcParts(date, time)
    if (seconds == null) {
      setLocalError('Enter a valid UTC date and time.')
      return
    }

    await startReplayAt(seconds)
    setOpen(false)
  }

  function onPreset(preset: RandomRangePreset): void {
    setLocalError(null)

    if (tab === 'manual') {
      if (imported) return
      const seconds = nowUtcSeconds() - rangeToSeconds(preset.value, preset.unit)
      const parts = toUtcParts(seconds)
      setDate(parts.date)
      setTime(parts.time)
      return
    }

    setRangeValue(preset.value)
    setRangeUnit(preset.unit)
  }

  const tabButtonClass = (active: boolean): string =>
    `inline-flex h-8 flex-1 items-center justify-center rounded border text-xs font-medium transition-colors ${
      active
        ? 'border-amber-500/70 bg-amber-950/40 text-amber-300'
        : 'border-zinc-700 bg-zinc-900/80 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
    }`

  return (
    <>
      <IconButton
        tooltip="Start replay"
        disabled={disabled || !canStart}
        tone="accent"
        onClick={openModal}
        className="!w-auto gap-1.5 px-2.5"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        <span className="text-xs font-medium">
          {replayLoading && mode !== 'replay' ? '…' : 'Replay'}
        </span>
      </IconButton>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="replay-modal-title"
            onSubmit={onSubmit}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
              <div>
                <h2 id="replay-modal-title" className="text-sm font-semibold text-amber-400">
                  Start replay
                </h2>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {imported
                    ? 'Imported data · UTC'
                    : `${TIMEFRAMES[timeframe]?.label ?? timeframe} · UTC`}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-1 border-b border-zinc-800 px-4 py-2">
              <button
                type="button"
                onClick={() => selectTab('manual')}
                className={tabButtonClass(tab === 'manual')}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => selectTab('random')}
                className={tabButtonClass(tab === 'random')}
              >
                Random
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              {tab === 'manual' && !imported && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      Start date (UTC)
                    </span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
                      <input
                        type="date"
                        value={date}
                        aria-label="Replay start date UTC"
                        onChange={(e) => setDate(e.target.value)}
                        className="h-8 w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs text-zinc-300 outline-none focus:border-amber-500/60"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      Start time (UTC)
                    </span>
                    <input
                      type="time"
                      value={time}
                      aria-label="Replay start time UTC"
                      onChange={(e) => setTime(e.target.value)}
                      className="mt-1 h-8 w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs text-zinc-300 outline-none focus:border-amber-500/60"
                    />
                  </label>
                </div>
              )}

              {tab === 'manual' && imported && (
                <p className="text-xs text-amber-500/80">
                  Replay from the start of the imported file.
                </p>
              )}

              {tab === 'random' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      Range length
                    </span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Dices className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
                      <input
                        type="number"
                        min={1}
                        value={rangeValue}
                        aria-label="Random range length"
                        onChange={(e) =>
                          setRangeValue(Math.max(1, Math.floor(Number(e.target.value)) || 1))
                        }
                        className="h-8 w-full rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none focus:border-amber-500/60"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      Unit
                    </span>
                    <select
                      value={rangeUnit}
                      aria-label="Random range unit"
                      onChange={(e) => setRangeUnit(e.target.value as RangeUnit)}
                      className="mt-1 h-8 w-full rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100 outline-none focus:border-amber-500/60"
                    >
                      {RANGE_UNITS.map((unit) => (
                        <option key={unit} value={unit} className="bg-zinc-900 text-zinc-100">
                          {RANGE_UNIT_LABELS[unit]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="col-span-2 text-[11px] text-zinc-600">
                    {imported
                      ? 'Random start within the imported file.'
                      : `Random start in the last ${RANDOM_LOOKBACK_DAYS === 365 ? '1y' : `${RANDOM_LOOKBACK_DAYS}d`}.`}
                  </p>
                </div>
              )}

              <div>
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  Quick select
                </span>
                <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                  {RANDOM_RANGE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => onPreset(preset)}
                      className="inline-flex h-7 items-center justify-center rounded border border-zinc-700 bg-zinc-900/80 text-xs font-medium text-zinc-300 hover:border-amber-500/60 hover:text-amber-200"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {localError && <p className="text-xs text-red-400">{localError}</p>}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 items-center rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={disabled || !canStart}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                Start
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
