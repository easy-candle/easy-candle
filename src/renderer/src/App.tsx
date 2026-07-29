import { useEffect, useMemo } from 'react'
import AppShell from '@/components/AppShell'
import CandleChart from '@/components/CandleChart'
import { buildOverlays } from '@/lib/indicators'
import { useReplayStore } from '@/store/replayStore'

export default function App() {
  const candles = useReplayStore((s) => s.candles)
  const mode = useReplayStore((s) => s.mode)
  const symbol = useReplayStore((s) => s.symbol)
  const visibleCandles = useReplayStore((s) => s.visibleCandles)
  const currentCandle = useReplayStore((s) => s.currentCandle)
  const chartSync = useReplayStore((s) => s.chartSync)
  const activeIndicators = useReplayStore((s) => s.activeIndicators)
  const tradeMarkers = useReplayStore((s) => s.tradeMarkers)
  const loadCandles = useReplayStore((s) => s.loadCandles)

  useEffect(() => {
    void loadCandles()
  }, [loadCandles])

  const overlaySource = mode === 'replay' ? (visibleCandles ?? []) : (candles ?? [])

  const overlays = useMemo(
    () => buildOverlays(overlaySource, activeIndicators),
    [overlaySource, activeIndicators]
  )

  return (
    <AppShell>
      <CandleChart
        mode={mode}
        symbol={symbol}
        candles={candles}
        visibleCandles={visibleCandles}
        currentCandle={currentCandle}
        chartSync={chartSync}
        overlays={overlays}
        tradeMarkers={tradeMarkers}
      />
    </AppShell>
  )
}
