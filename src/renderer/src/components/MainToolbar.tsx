import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Moon, Settings2, SquareSplitVertical, Sun, X } from 'lucide-react'
import ChartSnapshotDropdown from '@/components/ChartSnapshotDropdown'
import ChartTypeSelect from '@/components/ChartTypeSelect'
import IconButton from '@/components/IconButton'
import ImportDataDialog, { type ImportFeedback } from '@/components/ImportDataDialog'
import IndicatorsDropdown from '@/components/IndicatorsDropdown'
import ReplayStartDialog from '@/components/ReplayStartDialog'
import SessionDropdown from '@/components/SessionDropdown'
import StatusBar from '@/components/StatusBar'
import SymbolSelect from '@/components/SymbolSelect'
import TimeframeSelect from '@/components/TimeframeSelect'
import { useReplayStore } from '@/store/replayStore'
import { useThemeStore } from '@/store/themeStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

export default memo(function MainToolbar() {
  const mode = useReplayStore((s) => s.mode)
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const setChartSplit = useReplayStore((s) => s.setChartSplit)
  const chartFullscreen = useUiLayoutStore((s) => s.chartFullscreen)
  const toggleChartFullscreen = useUiLayoutStore((s) => s.toggleChartFullscreen)
  const showMainToolbar = useUiLayoutStore((s) => s.showMainToolbar)
  const showStatusBar = useUiLayoutStore((s) => s.showStatusBar)
  const setChartSettingsDialogOpen = useUiLayoutStore((s) => s.setChartSettingsDialogOpen)
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null)
  const feedbackTimer = useRef<number | null>(null)

  const inReplay = mode === 'replay'

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

  return (
    <>
      {!chartFullscreen && showMainToolbar && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800/90 bg-zinc-950/90 px-2 py-2 sm:px-2">
          <SymbolSelect />
          <TimeframeSelect />
          <ChartTypeSelect />
          <IndicatorsDropdown />
          {!inReplay && <ImportDataDialog onFeedback={setImportFeedback} />}
          {!inReplay && <ReplayStartDialog />}
          <div className="flex items-center gap-1 border-l border-zinc-800 pl-2">
            <IconButton
              tooltip={chartSplit ? 'Single chart' : 'Split chart (side by side)'}
              dataTour="split"
              active={chartSplit}
              onClick={() => setChartSplit(!chartSplit)}
            >
              <SquareSplitVertical className="h-4 w-4" />
            </IconButton>
            <IconButton
              tooltip="Chart settings"
              dataTour="chart-settings"
              onClick={() => setChartSettingsDialogOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
            </IconButton>
            <ChartSnapshotDropdown />
            <SessionDropdown />
            <IconButton
              tooltip="Full-screen chart"
              dataTour="fullscreen"
              shortcut={['F']}
              active={false}
              onClick={toggleChartFullscreen}
            >
              <Maximize2 className="h-4 w-4" />
            </IconButton>
            <IconButton
              tooltip={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              dataTour="theme"
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
    </>
  )
})
