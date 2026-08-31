import { useEffect, type ReactNode } from 'react'
import { Minimize2 } from 'lucide-react'
import AboutDialog from '@/components/AboutDialog'
import AccountDialog from '@/components/AccountDialog'
import AppTour from '@/components/AppTour'
import ChartSettingsDialog from '@/components/ChartSettingsDialog'
import DrawingToolbar from '@/components/DrawingToolbar'
import DrawingSettingsDialog from '@/components/DrawingSettingsDialog'
import FloatingReplayBar from '@/components/FloatingReplayBar'
import FloatingTradeBar from '@/components/FloatingTradeBar'
import IconButton from '@/components/IconButton'
import KeyboardShortcutsDialog from '@/components/KeyboardShortcutsDialog'
import MainToolbar from '@/components/MainToolbar'
import UpdateModal from '@/components/UpdateModal'
import SymbolManagerDialog from '@/components/SymbolManagerDialog'
import SessionManagerDialog from '@/components/SessionManagerDialog'
import SessionReportDialog from '@/components/SessionReportDialog'
import TitleBar from '@/components/TitleBar'
import OrderTicket from '@/components/OrderTicket'
import TradePanel from '@/components/TradePanel'
import { useReplayHotkeys } from '@/hooks/useReplayHotkeys'
import { useUiHotkeys } from '@/hooks/useUiHotkeys'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { isMetatraderImport } from '@shared/importTypes'
import { MT_BRIDGE_WS_URL } from '@shared/mtBridgeProtocol'

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
  const importMeta = useReplayStore((s) => s.importMeta)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const replayStatus = useReplayStore((s) => s.replayStatus)
  const candlesEmpty = useReplayStore((s) => s.candles.length === 0)
  const pause = useReplayStore((s) => s.pause)
  const loadCandles = useReplayStore((s) => s.loadCandles)
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const chartFullscreen = useUiLayoutStore((s) => s.chartFullscreen)
  const setChartFullscreen = useUiLayoutStore((s) => s.setChartFullscreen)
  const showDrawingToolbar = useUiLayoutStore((s) => s.showDrawingToolbar)
  const showReplayControls = useUiLayoutStore((s) => s.showReplayControls)
  const showPaperTrade = useUiLayoutStore((s) => s.showPaperTrade)
  const tourPaperTradePreview = useUiLayoutStore((s) => s.tourPaperTradePreview)

  const inReplay = mode === 'replay'
  const showOrderTicket = showPaperTrade && !chartFullscreen && (inReplay || tourPaperTradePreview)
  const imported = dataSource === 'imported'
  const mtbridge = dataSource === 'mtbridge'
  const mtFeed = mtbridge || isMetatraderImport(importMeta)
  const showEmptyLive =
    !inReplay && candlesEmpty && (status === 'ready' || (mtbridge && status === 'idle'))
  const showEndedBanner = inReplay && replayStatus === 'ended' && !chartFullscreen

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

      <MainToolbar />

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
          chartFullscreen ? 'p-0' : showDrawingToolbar ? 'py-1.5 px-2 sm:py-2' : 'p-1.5 sm:p-2'
        }`}
      >
        <div
          className={`relative flex gap-1 min-h-0 flex-1 overflow-hidden bg-zinc-950 ${
            chartFullscreen ? 'rounded-none border-0 shadow-none' : ''
          }`}
        >
          {showDrawingToolbar && <DrawingToolbar />}
          <div className="relative h-full min-h-0 min-w-0 flex-1 rounded-sm border border-zinc-800">
            {children}
            {showReplayControls && inReplay && <FloatingReplayBar />}
            {chartFullscreen && inReplay && <FloatingTradeBar />}
            {chartFullscreen && (
              <div
                className={`pointer-events-none absolute top-2 z-30 ${chartSplit ? 'top-[2.8rem]' : ''}`}
                style={{ right: Math.max(priceScaleWidth, 0) + 8 }}
              >
                <IconButton
                  tooltip="Exit full-screen chart"
                  shortcut={['F']}
                  onClick={() => setChartFullscreen(false)}
                  className="pointer-events-auto bg-zinc-950/90"
                >
                  <Minimize2 className="h-4 w-4" />
                </IconButton>
              </div>
            )}
            {(status === 'loading' || replayLoading) && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950/75 text-sm text-zinc-400">
                <span>{replayLoading ? 'Loading replay window…' : 'Loading candles…'}</span>
                <span className="text-xs text-zinc-600">
                  {imported
                    ? mtFeed
                      ? 'UTC · MetaTrader'
                      : 'UTC · Imported CSV'
                    : mtbridge
                      ? 'UTC · MetaTrader'
                      : 'UTC · Binance klines'}
                </span>
              </div>
            )}
            {showEmptyLive && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950/60 px-4 text-center text-sm text-zinc-400">
                <span>
                  {imported
                    ? 'No candles in the imported file.'
                    : mtbridge
                      ? `Attach the Easy Candle EA in MT5 and allow ${MT_BRIDGE_WS_URL}`
                      : 'No candles for this symbol / timeframe.'}
                </span>
                {!imported && !mtbridge && (
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
          {showOrderTicket && <OrderTicket />}
        </div>
        {showPaperTrade && !chartFullscreen && <TradePanel />}
      </main>

      <AppTour />
      <KeyboardShortcutsDialog />
      <AboutDialog />
      <AccountDialog />
      <ChartSettingsDialog />
      <DrawingSettingsDialog />
      <SymbolManagerDialog />
      <SessionManagerDialog />
      <SessionReportDialog />
      <UpdateModal />
    </div>
  )
}
