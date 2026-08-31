import { useMemo } from 'react'
import { buildOverlays, ungatedIndicatorIds } from '@/lib/indicators'
import { useAccountStore } from '@/store/accountStore'
import { useReplayStore } from '@/store/replayStore'
import { alignTimeToInterval, TIMEFRAMES } from '@shared/timeframes'

/**
 * Per-pane chart data from the replay store. `isPrimary` picks left vs right
 * slices so App does not subscribe to tick fields (`candles`, `chartSync`, ...).
 */
export function useChartPaneModel(isPrimary: boolean) {
  const mode = useReplayStore((s) => s.mode)
  const symbol = useReplayStore((s) => s.symbol)
  const chartType = useReplayStore((s) => s.chartType)
  const activeIndicators = useReplayStore((s) => s.activeIndicators)
  const signedIn = useAccountStore((s) => s.signedIn)
  const timeframe = useReplayStore((s) => (isPrimary ? s.timeframe : s.secondaryTimeframe))
  const candles = useReplayStore((s) => (isPrimary ? s.candles : s.secondaryCandles))
  const visibleCandles = useReplayStore((s) =>
    isPrimary ? s.visibleCandles : s.secondaryVisibleCandles
  )
  const currentCandle = useReplayStore((s) =>
    isPrimary ? s.currentCandle : s.secondaryCurrentCandle
  )
  const chartSync = useReplayStore((s) => (isPrimary ? s.chartSync : s.secondaryChartSync))
  const rawTradeMarkers = useReplayStore((s) => s.tradeMarkers)

  const overlayIds = useMemo(
    () => ungatedIndicatorIds(activeIndicators, signedIn),
    [activeIndicators, signedIn]
  )
  const overlaySource = mode === 'replay' ? (visibleCandles ?? []) : (candles ?? [])
  const overlays = useMemo(
    () => buildOverlays(overlaySource, overlayIds),
    [overlaySource, overlayIds]
  )

  const tradeMarkers = useMemo(() => {
    const markers = rawTradeMarkers ?? []
    if (isPrimary) return markers
    const interval = TIMEFRAMES[timeframe]?.seconds ?? 60
    return markers.map((marker) => ({
      ...marker,
      time: alignTimeToInterval(marker.time, interval)
    }))
  }, [isPrimary, rawTradeMarkers, timeframe])

  return {
    mode,
    symbol,
    timeframe,
    chartType,
    candles,
    visibleCandles,
    currentCandle,
    chartSync,
    overlays,
    tradeMarkers
  }
}
