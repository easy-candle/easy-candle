import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  createTextWatermark,
  CrosshairMode,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type ITextWatermarkPluginApi,
  type SeriesMarker,
  type Time
} from 'lightweight-charts'
import DrawingOverlay from '@/components/DrawingOverlay'
import OhlcLegend from '@/components/OhlcLegend'
import wordmarkUrl from '@/assets/easycandle-wordmark.svg'
import type { ChartOverlay } from '@/lib/indicators'
import type { Candle } from '@shared/candleUtils'
import type { ChartSync, TradeMarker, ViewMode } from '@/store/replayStore'

const DEFAULT_VISIBLE_BARS = 50

function focusLatestCandle(
  chart: IChartApi,
  candleCount: number,
  leftBars = DEFAULT_VISIBLE_BARS
): void {
  if (!chart || candleCount <= 0) return

  const last = candleCount - 1
  const span = Math.min(leftBars, Math.max(candleCount - 1, 1))

  chart.timeScale().setVisibleLogicalRange({
    from: last - span,
    to: last + span
  })
}

type CandleChartProps = {
  mode?: ViewMode
  symbol?: string
  timeframe?: string
  candles?: Candle[] | null
  visibleCandles?: Candle[] | null
  currentCandle?: Candle | null
  chartSync?: ChartSync | null
  overlays?: ChartOverlay[] | null
  tradeMarkers?: TradeMarker[] | null
}

export default function CandleChart({
  mode = 'live',
  symbol = '',
  timeframe = '',
  candles = null,
  visibleCandles = null,
  currentCandle = null,
  chartSync = null,
  overlays = null,
  tradeMarkers = null
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const watermarkRef = useRef<ITextWatermarkPluginApi<Time> | null>(null)
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const [chartReady, setChartReady] = useState<{
    chart: IChartApi
    series: ISeriesApi<'Candlestick'>
  } | null>(null)

  function reset(next: Candle[] = [], opts: { fitContent?: boolean } = {}): void {
    const series = seriesRef.current
    const chart = chartRef.current
    if (!series || !chart) return

    const data = next ?? []
    series.setData(data as never)

    if (opts.fitContent !== false && data.length) {
      requestAnimationFrame(() => {
        if (chartRef.current !== chart || seriesRef.current !== series) return
        // Re-enable autoscaling after symbol/price-range changes (e.g. BNB → XAU).
        series.priceScale().applyOptions({ autoScale: true })
        chart.priceScale('right').applyOptions({ autoScale: true })
        focusLatestCandle(chart, data.length)
      })
    }
  }

  function append(candle: Candle): void {
    const series = seriesRef.current
    if (!series || !candle) return
    series.update(candle as never)
  }

  function syncOverlays(nextOverlays: ChartOverlay[] | null | undefined): void {
    const chart = chartRef.current
    if (!chart) return

    const list = Array.isArray(nextOverlays) ? nextOverlays : []
    const nextIds = new Set(list.map((item) => item.id))
    const map = overlaySeriesRef.current

    for (const [id, series] of map.entries()) {
      if (!nextIds.has(id)) {
        chart.removeSeries(series)
        map.delete(id)
      }
    }

    for (const overlay of list) {
      if (overlay.type !== 'line') continue

      let series = map.get(overlay.id)
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: overlay.color || '#38bdf8',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false
        })
        map.set(overlay.id, series)
      } else if (overlay.color) {
        series.applyOptions({ color: overlay.color })
      }

      series.setData((overlay.data ?? []) as never)
    }
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const chart = createChart(container, {
      width: container.clientWidth,
      height: Math.max(container.clientHeight, 1),
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#a1a1aa'
      },
      crosshair: {
        mode: CrosshairMode.Normal
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' }
      },
      rightPriceScale: {
        borderColor: '#3f3f46'
      },
      timeScale: {
        borderColor: '#3f3f46',
        timeVisible: true,
        secondsVisible: false
      }
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444'
    })

    markersRef.current = createSeriesMarkers(series, [])
    watermarkRef.current = createTextWatermark(chart.panes()[0], {
      horzAlign: 'center',
      vertAlign: 'center',
      lines: [
        {
          text: '',
          color: 'rgba(255, 255, 255, 0.05)',
          fontSize: 72,
          fontFamily: 'Segoe UI, sans-serif',
          fontStyle: '600'
        }
      ]
    })

    chartRef.current = chart
    seriesRef.current = series
    setChartReady({ chart, series })

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        chart.applyOptions({ width, height })
      }
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
      overlaySeriesRef.current.clear()
      markersRef.current = null
      watermarkRef.current = null
      setChartReady(null)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  // Keep the text watermark in sync with the selected symbol.
  useEffect(() => {
    const watermark = watermarkRef.current
    if (!watermark) return
    watermark.applyOptions({
      lines: [
        {
          text: symbol || '',
          color: 'rgba(255, 255, 255, 0.05)',
          fontSize: 72,
          fontFamily: 'Segoe UI, sans-serif',
          fontStyle: '600'
        }
      ]
    })
  }, [symbol])

  useEffect(() => {
    if (mode !== 'live') return
    reset(candles ?? [], { fitContent: true })
  }, [mode, candles, symbol])

  useEffect(() => {
    if (mode !== 'replay' || !chartSync) return

    if (chartSync.kind === 'append' && currentCandle) {
      append(currentCandle)
      return
    }

    reset(visibleCandles ?? [], { fitContent: chartSync.fitContent })
  }, [mode, chartSync?.revision, symbol])

  useEffect(() => {
    syncOverlays(overlays)
  }, [overlays])

  useEffect(() => {
    const markersApi = markersRef.current
    if (!markersApi) return
    const markers = Array.isArray(tradeMarkers) ? tradeMarkers : []
    const source = mode === 'replay' ? (visibleCandles ?? []) : (candles ?? [])
    const knownTimes = new Set(source.map((c) => c.time))
    const sorted = markers
      .filter((m) => knownTimes.has(m.time))
      .sort((a, b) => a.time - b.time) as SeriesMarker<Time>[]
    markersApi.setMarkers(sorted)
  }, [tradeMarkers, mode, candles, visibleCandles])

  const seriesCandles = mode === 'replay' ? (visibleCandles ?? []) : (candles ?? [])
  const empty = seriesCandles.length === 0

  return (
    <div className="absolute inset-0 h-full w-full">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      <img
        src={wordmarkUrl}
        alt=""
        className="pointer-events-none absolute left-1/2 top-[58%] z-[1] h-auto w-[min(48%,380px)] -translate-x-1/2 -translate-y-1/2 opacity-[0.08] select-none"
        aria-hidden
      />
      {chartReady && (
        <>
          <OhlcLegend chart={chartReady.chart} series={chartReady.series} candles={seriesCandles} />
          <DrawingOverlay
            chart={chartReady.chart}
            series={chartReady.series}
            paneTimeframe={timeframe}
            paneCurrentCandle={currentCandle}
            paneCandles={seriesCandles}
          />
        </>
      )}
      {empty && (
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-zinc-950/40 px-4 text-center text-sm text-zinc-500">
          {mode === 'replay' ? 'No candles in this replay window yet.' : 'No candles to display.'}
        </div>
      )}
    </div>
  )
}
