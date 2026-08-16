import { Clock3 } from 'lucide-react'
import { TIMEFRAME_IDS, TIMEFRAMES } from '@shared/timeframes'

type PaneChromeProps = {
  label: string
  timeframe: string
  timeframeEditable?: boolean
  timeframeDisabled?: boolean
  timeframeTitle?: string
  onTimeframeChange?: (timeframe: string) => void
  showDriver?: boolean
  isDriver?: boolean
  onSelectDriver?: () => void
  driverDisabled?: boolean
}

export default function PaneChrome({
  label,
  timeframe,
  timeframeEditable = false,
  timeframeDisabled = false,
  timeframeTitle,
  onTimeframeChange,
  showDriver = false,
  isDriver = false,
  onSelectDriver,
  driverDisabled = false
}: PaneChromeProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 border-b border-b-zinc-800 z-[2] flex items-center justify-between gap-2 bg-gradient-to-b from-zinc-950/90 to-transparent px-2 py-1.5">
      <div className="pointer-events-auto flex min-w-0 items-center gap-1.5">
        <span className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          {label}
        </span>
        {timeframeEditable && onTimeframeChange ? (
          <label className="flex h-6 items-center gap-1 rounded border border-zinc-700 bg-zinc-900/90 px-1.5 text-[11px] text-zinc-400">
            <Clock3 className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden />
            <span className="sr-only">{label} timeframe</span>
            <select
              className="rounded bg-zinc-900 text-zinc-100 outline-none disabled:opacity-60"
              value={timeframe}
              disabled={timeframeDisabled}
              title={timeframeTitle}
              aria-label={`${label} timeframe`}
              onChange={(event) => onTimeframeChange(event.target.value)}
            >
              {TIMEFRAME_IDS.map((id) => (
                <option key={id} value={id} className="bg-zinc-900 text-zinc-100">
                  {TIMEFRAMES[id].label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="rounded border border-zinc-800 bg-zinc-900/80 px-1.5 py-0.5 text-[11px] text-zinc-400">
            {TIMEFRAMES[timeframe]?.label ?? timeframe}
          </span>
        )}
      </div>
      {showDriver && onSelectDriver && (
        <button
          type="button"
          disabled={driverDisabled}
          onClick={() => {
            onSelectDriver()
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur()
            }
          }}
          title={
            isDriver
              ? `Step/play advances this ${TIMEFRAMES[timeframe]?.label ?? timeframe} pane`
              : `Step/play on this ${TIMEFRAMES[timeframe]?.label ?? timeframe} pane`
          }
          aria-label={
            isDriver
              ? `Stepping ${TIMEFRAMES[timeframe]?.label ?? timeframe}`
              : `Use ${TIMEFRAMES[timeframe]?.label ?? timeframe} for next candle`
          }
          aria-pressed={isDriver}
          className={`pointer-events-auto inline-flex h-7 items-center rounded border px-2 text-[10px] font-medium uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            isDriver
              ? 'border-amber-500/70 bg-amber-950/40 text-amber-300'
              : 'border-zinc-700 bg-zinc-900/80 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
          }`}
        >
          {isDriver ? `Next · ${TIMEFRAMES[timeframe]?.label ?? timeframe}` : 'Use for next'}
        </button>
      )}
    </div>
  )
}
