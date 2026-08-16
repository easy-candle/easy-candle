import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2, Moon, SquareSplitVertical, Sun, X } from 'lucide-react'
import AboutDialog from '@/components/AboutDialog'
import ChartTypeSelect from '@/components/ChartTypeSelect'
import ImportDataDialog, { type ImportFeedback } from '@/components/ImportDataDialog'
import DrawingToolbar from '@/components/DrawingToolbar'
import FloatingDrawingBar from '@/components/FloatingDrawingBar'
import FloatingReplayBar from '@/components/FloatingReplayBar'
import FloatingTradeBar from '@/components/FloatingTradeBar'
import IconButton from '@/components/IconButton'
import IndicatorsDropdown from '@/components/IndicatorsDropdown'
import KeyboardShortcutsDialog from '@/components/KeyboardShortcutsDialog'
import ReplayStartDialog from '@/components/ReplayStartDialog'
import SessionReportModal from '@/components/SessionReportModal'
import UpdateModal from '@/components/UpdateModal'
import StatusBar from '@/components/StatusBar'
import SymbolSelect from '@/components/SymbolSelect'
import TimeframeSelect from '@/components/TimeframeSelect'
import TitleBar from '@/components/TitleBar'
import TradePanel from '@/components/TradePanel'
import { useReplayHotkeys } from '@/hooks/useReplayHotkeys'
import { useUiHotkeys } from '@/hooks/useUiHotkeys'
import { useReplayStore } from '@/store/replayStore'
import { useThemeStore } from '@/store/themeStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

export default function AppShell({
  children,
  priceScaleWidth = 0
}: {
  children: ReactNode
  priceScaleWidth?: number
}) {
  const status = useReplayStore((s) => s.status)
  const error = useReplayStore((s) => s.error)
  const mode = useReplayStore((s) => s.mode)
  const dataSource = useReplayStore((s) => s.dataSource)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const candles = useReplayStore((s) => s.candles)
  const pause = useReplayStore((s) => s.pause)
  const loadCandles = useReplayStore((s) => s.loadCandles)
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const setChartSplit = useReplayStore((s) => s.setChartSplit)
  const chartFullscreen = useUiLayoutStore((s) => s.chartFullscreen)
  const toggleChartFullscreen = useUiLayoutStore((s) => s.toggleChartFullscreen)
  const setChartFullscreen = useUiLayoutStore((s) => s.setChartFullscreen)
  const showMainToolbar = useUiLayoutStore((s) => s.showMainToolbar)
  const showStatusBar = useUiLayoutStore((s) => s.showStatusBar)
  const showDrawingToolbar = useUiLayoutStore((s) => s.showDrawingToolbar)
  const showReplayControls = useUiLayoutStore((s) => s.showReplayControls)
  const showPaperTrade = useUiLayoutStore((s) => s.showPaperTrade)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null)
  const feedbackTimer = useRef<number | null>(null)

  const inReplay = mode === 'replay'
  const imported = dataSource === 'imported'
  const showEmptyLive = !inReplay && status === 'ready' && candles.length === 0
  const showEndedBanner = inReplay && replayStatus === 'ended' && !chartFullscreen

  useEffect(() => {
    if (inReplay) setImportFeedback(null)
  }, [inReplay])

  useEffect(() => {
    if (feedbackTimer.current != null) window.clearTimeout(feedbackTimer.current)
    feedbackTimer.current = null
    if (!importFeedback) return undefined

    feedbackTimer.current = window.setTimeout(() => setImportFeedback(null), 5000)
    return () => {
      if (feedbackTimer.current != null) window.clearTimeout(feedbackTimer.current)
    }
  }, [importFeedback])

  useReplayHotkeys()
  useUiHotkeys()

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
      {!chartFullscreen && <TitleBar />}

      {!chartFullscreen && showMainToolbar && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800/90 bg-zinc-950/90 px-2 py-2 sm:px-2">
          <SymbolSelect />
          <TimeframeSelect />
          <ChartTypeSelect />
          <IndicatorsDropdown />
          {!inReplay && <ImportDataDialog onFeedback={setImportFeedback} />}
          {!inReplay && <ReplayStartDialog />}
          {showDrawingToolbar && <DrawingToolbar />}
          <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
            <IconButton
              tooltip={chartSplit ? 'Single chart' : 'Split chart (side by side)'}
              active={chartSplit}
              onClick={() => setChartSplit(!chartSplit)}
            >
              <SquareSplitVertical className="h-4 w-4" />
            </IconButton>
            <IconButton
              tooltip="Full-screen chart"
              shortcut={['F']}
              active={false}
              onClick={toggleChartFullscreen}
            >
              <Maximize2 className="h-4 w-4" />
            </IconButton>
            <IconButton
              tooltip={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </IconButton>
          </div>
          {showStatusBar && <StatusBar />}
        </div>
      )}

      {importFeedback &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-[70] w-80 max-w-[calc(100vw-2rem)]">
            <div
              role="status"
              className={`pointer-events-auto flex items-center justify-between gap-3 rounded border bg-zinc-950/95 px-3 py-2.5 text-xs leading-relaxed shadow-xl shadow-black/50 ${
                importFeedback.tone === 'error'
                  ? 'border-red-900/60 text-red-200'
                  : 'border-zinc-800/50 text-amber-200/90'
              }`}
            >
              <p className="min-w-0 flex-1 break-words">{importFeedback.message}</p>
              <button
                type="button"
                aria-label="Dismiss message"
                onClick={() => setImportFeedback(null)}
                className="inline-flex h-6 w-6 shrink-0 text-gray-400 items-center justify-center rounded border border-transparent opacity-80 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>,
          document.body
        )}

      {!chartFullscreen && status === 'error' && error && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-red-900/50 bg-red-950/40 px-3 py-1.5 text-sm text-red-300 sm:px-4">
          <span className="min-w-0 flex-1 break-words">{error}</span>
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
          {imported
            ? 'Replay reached the end of the imported file. Step back, jump within the file, or exit replay.'
            : 'Replay reached the end of the loaded buffer. Jump to another UTC time, step back, or exit to live.'}
        </div>
      )}

      <main
        className={`relative flex min-h-0 flex-1 flex-col ${
          chartFullscreen ? 'p-0' : 'p-1.5 sm:p-2'
        }`}
      >
        <div
          className={`relative min-h-0 flex-1 overflow-hidden bg-zinc-950 ${
            chartFullscreen
              ? 'rounded-none border-0 shadow-none'
              : 'rounded-sm border border-zinc-800 shadow-[inset_0_1px_0_0_rgba(63,63,70,0.35)]'
          }`}
        >
          {children}
          {showReplayControls && inReplay && <FloatingReplayBar />}
          {showDrawingToolbar && chartFullscreen && <FloatingDrawingBar />}
          {chartFullscreen && inReplay && <FloatingTradeBar />}
          {chartFullscreen && (
            <div
              className={`pointer-events-none absolute top-2 z-30 ${chartSplit ? 'top-11' : ''}`}
              style={{ right: Math.max(priceScaleWidth, 0) + 8 }}
            >
              <IconButton
                tooltip="Exit full-screen chart"
                shortcut={['F']}
                onClick={() => setChartFullscreen(false)}
                className="pointer-events-auto bg-zinc-950/90 shadow-lg shadow-black/40"
              >
                <Minimize2 className="h-4 w-4" />
              </IconButton>
            </div>
          )}
          {(status === 'loading' || replayLoading) && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950/75 text-sm text-zinc-400">
              <span>{replayLoading ? 'Loading replay window…' : 'Loading candles…'}</span>
              <span className="text-xs text-zinc-600">
                {imported ? 'UTC · Imported CSV' : 'UTC · Binance klines'}
              </span>
            </div>
          )}
          {showEmptyLive && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950/60 px-4 text-center text-sm text-zinc-400">
              <span>
                {imported
                  ? 'No candles in the imported file.'
                  : 'No candles for this symbol / timeframe.'}
              </span>
              {!imported && (
                <button
                  type="button"
                  onClick={() => void loadCandles()}
                  className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
                >
                  Reload
                </button>
              )}
            </div>
          )}
        </div>
        {showPaperTrade && !chartFullscreen && <TradePanel />}
      </main>

      <KeyboardShortcutsDialog />
      <AboutDialog />
      <SessionReportModal />
      <UpdateModal />
    </div>
  )
}
