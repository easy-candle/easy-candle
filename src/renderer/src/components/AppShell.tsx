import { useEffect, useState, type ReactNode } from 'react'
import DrawingToolbar from '@/components/DrawingToolbar'
import IndicatorToggles from '@/components/IndicatorToggles'
import ReplayControls from '@/components/ReplayControls'
import ReplayStartPicker from '@/components/ReplayStartPicker'
import SessionReportModal from '@/components/SessionReportModal'
import StatusBar from '@/components/StatusBar'
import SymbolSelect from '@/components/SymbolSelect'
import TimeframeSelect from '@/components/TimeframeSelect'
import TradePanel from '@/components/TradePanel'
import iconUrl from '@/assets/easycandle-icon.svg'
import { useReplayHotkeys } from '@/hooks/useReplayHotkeys'
import { useReplayStore } from '@/store/replayStore'

export default function AppShell({ children }: { children: ReactNode }) {
  const status = useReplayStore((s) => s.status)
  const error = useReplayStore((s) => s.error)
  const mode = useReplayStore((s) => s.mode)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const candles = useReplayStore((s) => s.candles)
  const pause = useReplayStore((s) => s.pause)
  const loadCandles = useReplayStore((s) => s.loadCandles)
  const [appVersion, setAppVersion] = useState('')

  const inReplay = mode === 'replay'
  const showEmptyLive = !inReplay && status === 'ready' && candles.length === 0
  const showEndedBanner = inReplay && replayStatus === 'ended'

  useReplayHotkeys()

  useEffect(() => {
    void window.api.getAppVersion().then(setAppVersion)
  }, [])

  useEffect(() => {
    function onVisibility(): void {
      if (document.visibilityState === 'hidden') {
        const state = useReplayStore.getState()
        if (state.mode === 'replay' && state.isPlaying) {
          pause()
        }
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pause])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-950">
      <header className="shrink-0 border-b border-zinc-800/90 bg-gradient-to-b from-zinc-900/80 to-zinc-950 px-3 py-2.5 sm:px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img
              src={iconUrl}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded border border-amber-500/30"
              aria-hidden
            />
            <div className="leading-tight">
              <h1 className="text-sm font-semibold tracking-tight text-amber-400">
                Easy Candle{appVersion ? ` v${appVersion}` : ''}
              </h1>
              <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                {inReplay ? 'Replay · UTC' : 'Live · UTC'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800/90 bg-zinc-950/90 px-3 py-2 sm:px-4">
        <SymbolSelect />
        <TimeframeSelect />
        <IndicatorToggles />
        {!inReplay ? <ReplayStartPicker /> : <ReplayControls />}
        <DrawingToolbar />
        <StatusBar />
      </div>

      {status === 'error' && error && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-red-900/50 bg-red-950/40 px-3 py-1.5 text-sm text-red-300 sm:px-4">
          <span>{error}</span>
          {!inReplay && (
            <button
              type="button"
              onClick={() => void loadCandles()}
              className="rounded border border-red-800/80 px-2 py-0.5 text-xs text-red-200 hover:border-red-600 hover:text-red-100"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {showEndedBanner && (
        <div className="shrink-0 border-b border-amber-900/40 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200/90 sm:px-4">
          Replay reached the end of the loaded buffer. Jump to another UTC time, step back, or exit
          to live.
        </div>
      )}

      <main className="relative flex min-h-0 flex-1 flex-col p-1.5 sm:p-2">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950 shadow-[inset_0_1px_0_0_rgba(63,63,70,0.35)]">
          {children}
          {(status === 'loading' || replayLoading) && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950/75 text-sm text-zinc-400">
              <span>{replayLoading ? 'Loading replay window…' : 'Loading candles…'}</span>
              <span className="text-xs text-zinc-600">UTC · Binance klines</span>
            </div>
          )}
          {showEmptyLive && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950/60 px-4 text-center text-sm text-zinc-400">
              <span>No candles for this symbol / timeframe.</span>
              <button
                type="button"
                onClick={() => void loadCandles()}
                className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
              >
                Reload
              </button>
            </div>
          )}
        </div>
        <TradePanel />
      </main>

      <SessionReportModal />
    </div>
  )
}
