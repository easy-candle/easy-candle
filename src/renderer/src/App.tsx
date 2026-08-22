import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/AppShell'
import CandleChart from '@/components/CandleChart'
import PaneChrome from '@/components/PaneChrome'
import VisibleRangeReadout from '@/components/VisibleRangeReadout'
import { buildOverlays } from '@/lib/indicators'
import type { VisibleRangeInfo } from '@/lib/chart/visibleRange'
import { alignTimeToInterval, TIMEFRAMES } from '@shared/timeframes'
import { isDesktopRuntime } from '@/lib/runtime'
import { useReplayStore } from '@/store/replayStore'

export default function App() {
  const candles = useReplayStore((s) => s.candles)
  const mode = useReplayStore((s) => s.mode)
  const symbol = useReplayStore((s) => s.symbol)
  const timeframe = useReplayStore((s) => s.timeframe)
  const visibleCandles = useReplayStore((s) => s.visibleCandles)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const chartSync = useReplayStore((s) => s.chartSync)
  const activeIndicators = useReplayStore((s) => s.activeIndicators)
  const chartType = useReplayStore((s) => s.chartType)
  const tradeMarkers = useReplayStore((s) => s.tradeMarkers)
  const loadCandles = useReplayStore((s) => s.loadCandles)
  const chartSplit = useReplayStore((s) => s.chartSplit)
  const secondaryTimeframe = useReplayStore((s) => s.secondaryTimeframe)
  const driverPane = useReplayStore((s) => s.driverPane)
  const secondaryCandles = useReplayStore((s) => s.secondaryCandles)
  const secondaryVisibleCandles = useReplayStore((s) => s.secondaryVisibleCandles)
  const secondaryCurrentCandle = useReplayStore((s) => s.secondaryCurrentCandle)
  const secondaryChartSync = useReplayStore((s) => s.secondaryChartSync)
  const secondaryLoading = useReplayStore((s) => s.secondaryLoading)
  const secondaryError = useReplayStore((s) => s.secondaryError)
  const dataSource = useReplayStore((s) => s.dataSource)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const importWindow = useReplayStore((s) => s.importWindow)
  const isPrefetching = useReplayStore((s) => s.isPrefetching)
  const loadImportedHistory = useReplayStore((s) => s.loadImportedHistory)
  const setSecondaryTimeframe = useReplayStore((s) => s.setSecondaryTimeframe)
  const setDriverPane = useReplayStore((s) => s.setDriverPane)
  const [primaryPriceScaleWidth, setPrimaryPriceScaleWidth] = useState(0)
  const [secondaryPriceScaleWidth, setSecondaryPriceScaleWidth] = useState(0)
  const [primaryVisibleRange, setPrimaryVisibleRange] = useState<VisibleRangeInfo | null>(null)
  const [historyRequest, setHistoryRequest] = useState<{
    /** Series identity, so a stale readout is dropped on symbol/TF/source change. */
    key: string
    count: number
    untilTime: number
  } | null>(null)
  const seriesKey = `${dataSource}:${symbol}:${timeframe}`

  /**
   * Range-based loading hook. Fires once per loaded series when the viewport
   * reaches the oldest candle on the chart. Imported datasets page an older
   * window in from disk/IndexedDB here instead of holding the whole series;
   * Binance history still comes from the replay window loader.
   */
  const handleReachHistoryEdge = useCallback(
    (info: VisibleRangeInfo) => {
      setHistoryRequest((prev) => ({
        key: seriesKey,
        count: prev?.key === seriesKey ? prev.count + 1 : 1,
        untilTime: info.fromTime ?? 0
      }))
      if (dataSource === 'imported') {
        void loadImportedHistory()
      }
    },
    [dataSource, loadImportedHistory, seriesKey]
  )

  useEffect(() => {
    void loadCandles()
  }, [loadCandles])

  useEffect(() => {
    if (!isDesktopRuntime()) return
    const unsub = window.api.onMtBridgeEvent((event) => {
      useReplayStore.getState().handleMtBridgeEvent(event)
    })
    void window.api.mtBridgeStatus().then((status) => {
      useReplayStore.getState().syncMtBridgeStatus(status)
    })
    return unsub
  }, [])

  const overlaySource = mode === 'replay' ? (visibleCandles ?? []) : (candles ?? [])
  const secondaryOverlaySource =
    mode === 'replay' ? (secondaryVisibleCandles ?? []) : (secondaryCandles ?? [])

  const overlays = useMemo(
    () => buildOverlays(overlaySource, activeIndicators),
    [overlaySource, activeIndicators]
  )

  const secondaryOverlays = useMemo(
    () => buildOverlays(secondaryOverlaySource, activeIndicators),
    [secondaryOverlaySource, activeIndicators]
  )

  const secondaryMarkers = useMemo(() => {
    const interval = TIMEFRAMES[secondaryTimeframe]?.seconds ?? 60
    return (tradeMarkers ?? []).map((marker) => ({
      ...marker,
      time: alignTimeToInterval(marker.time, interval)
    }))
  }, [tradeMarkers, secondaryTimeframe])

  const primaryProps = {
    mode,
    symbol,
    timeframe,
    chartType,
    candles,
    visibleCandles,
    currentCandle,
    chartSync,
    overlays,
    tradeMarkers,
    onPriceScaleWidthChange: setPrimaryPriceScaleWidth,
    onVisibleRangeChange: setPrimaryVisibleRange,
    onReachHistoryEdge: handleReachHistoryEdge,
    isPrimary: true
  }

  const secondaryProps = {
    mode,
    symbol,
    timeframe: secondaryTimeframe,
    chartType,
    candles: secondaryCandles,
    visibleCandles: secondaryVisibleCandles,
    currentCandle: secondaryCurrentCandle,
    chartSync: secondaryChartSync,
    overlays: secondaryOverlays,
    tradeMarkers: secondaryMarkers,
    onPriceScaleWidthChange: setSecondaryPriceScaleWidth,
    isPrimary: false
  }

  const showDriver = mode === 'replay' && chartSplit
  const secondaryTfDisabled = secondaryLoading || replayLoading
  const priceScaleWidth = chartSplit ? secondaryPriceScaleWidth : primaryPriceScaleWidth

  return (
    <AppShell priceScaleWidth={priceScaleWidth}>
      <div className={`flex h-full w-full ${chartSplit ? 'flex-row' : ''}`}>
        <div
          className={`relative min-h-0 min-w-0 ${chartSplit ? 'flex-1 border-r border-zinc-800' : 'h-full w-full'}`}
        >
          {chartSplit && (
            <PaneChrome
              label="Left"
              timeframe={timeframe}
              showDriver={showDriver}
              isDriver={driverPane === 'primary'}
              onSelectDriver={() => setDriverPane('primary')}
              driverDisabled={replayLoading || secondaryLoading}
            />
          )}
          <div className={chartSplit ? 'absolute inset-0 top-9' : 'absolute inset-0'}>
            <CandleChart {...primaryProps} />
            <VisibleRangeReadout
              info={primaryVisibleRange}
              loadedCount={overlaySource.length}
              historyRequest={historyRequest?.key === seriesKey ? historyRequest : null}
              historyPaging={dataSource === 'imported' && importWindow?.hasMoreBefore === true}
              historyLoading={dataSource === 'imported' && isPrefetching}
            />
          </div>
        </div>
        {chartSplit && (
          <div className="relative min-h-0 min-w-0 flex-1">
            <PaneChrome
              label="Right"
              timeframe={secondaryTimeframe}
              timeframeEditable
              timeframeDisabled={secondaryTfDisabled}
              timeframeTitle={
                dataSource === 'imported'
                  ? 'Secondary pane can use another timeframe from the same import'
                  : undefined
              }
              onTimeframeChange={setSecondaryTimeframe}
              showDriver={showDriver}
              isDriver={driverPane === 'secondary'}
              onSelectDriver={() => setDriverPane('secondary')}
              driverDisabled={replayLoading || secondaryLoading}
            />
            <div className="absolute inset-0 top-9">
              <CandleChart {...secondaryProps} />
            </div>
            {(secondaryLoading || secondaryError) && (
              <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center bg-zinc-950/50 px-3 text-center text-xs text-zinc-400">
                {secondaryLoading ? 'Loading secondary pane…' : secondaryError}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
