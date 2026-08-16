import { useEffect, useRef, useState } from 'react'
import {
  BarSeries,
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
  type SeriesType,
  type Time
} from 'lightweight-charts'
import DrawingOverlay from '@/components/DrawingOverlay'
import OhlcLegend from '@/components/OhlcLegend'
import wordmarkUrl from '@/assets/easycandle-wordmark.svg'
import type { ChartOverlay } from '@/lib/indicators'
import {
  buildHeikinAshiPoint,
  buildSeriesData,
  toHeikinAshi,
  type ChartType
} from '@/lib/chart/chartTypes'
import type { Candle } from '@shared/candleUtils'
import { CHART_PALETTES, type ChartPalette } from '@/lib/theme'
import { useThemeStore } from '@/store/themeStore'
import type { ChartSync, TradeMarker, ViewMode } from '@/store/replayStore'

const DEFAULT_VISIBLE_BARS = 50

function chartThemeOptions(palette: ChartPalette): {
  layout: {
    background: { type: ColorType.Solid; color: string }
    textColor: string
  }
  grid: { vertLines: { color: string }; horzLines: { color: string } }
  rightPriceScale: { borderColor: string }
  timeScale: { borderColor: string }
} {
  return {
    layout: {
      background: { type: ColorType.Solid, color: palette.background },
      textColor: palette.text
    },
    grid: {
      vertLines: { color: palette.grid },
      horzLines: { color: palette.grid }
    },
    rightPriceScale: {
      borderColor: palette.scaleBorder
    },
    timeScale: {
      borderColor: palette.scaleBorder
    }
  }
}

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

function addSeries(chart: IChartApi, type: ChartType): ISeriesApi<SeriesType> {
  switch (type) {
    case 'line':
      return chart.addSeries(LineSeries, {
        color: '#22c55e',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false
      })
    case 'bar':
      return chart.addSeries(BarSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        thinBars: false
      })
    case 'heikinashi':
    case 'candlestick':
    default:
      return chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444'
      })
  }
}

type CandleChartProps = {
  mode?: ViewMode
  symbol?: string
  timeframe?: string
  chartType?: ChartType
  candles?: Candle[] | null
  visibleCandles?: Candle[] | null
  currentCandle?: Candle | null
  chartSync?: ChartSync | null
  overlays?: ChartOverlay[] | null
  tradeMarkers?: TradeMarker[] | null
  onPriceScaleWidthChange?: (width: number) => void
}

export default function CandleChart({
  mode = 'live',
  symbol = '',
  timeframe = '',
  chartType = 'candlestick',
  candles = null,
  visibleCandles = null,
  currentCandle = null,
  chartSync = null,
  overlays = null,
  tradeMarkers = null,
  onPriceScaleWidthChange
}: CandleChartProps) {
  const theme = useThemeStore((s) => s.theme)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null)
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const watermarkRef = useRef<ITextWatermarkPluginApi<Time> | null>(null)
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const onPriceScaleWidthChangeRef = useRef(onPriceScaleWidthChange)
  const priceScaleObserverRef = useRef<ResizeObserver | null>(null)
  const priceScaleCellRef = useRef<HTMLElement | null>(null)
  const priceScaleWidthRef = useRef(0)
  const chartTypeRef = useRef(chartType)
  const seriesTypeRef = useRef<ChartType>(chartType)
  const haLastRef = useRef<Candle | null>(null)
  const [chartReady, setChartReady] = useState<{
    chart: IChartApi
    series: ISeriesApi<SeriesType>
  } | null>(null)

  useEffect(() => {
    onPriceScaleWidthChangeRef.current = onPriceScaleWidthChange
  }, [onPriceScaleWidthChange])

  useEffect(() => {
    chartTypeRef.current = chartType
  }, [chartType])

  function reset(next: Candle[] = [], opts: { fitContent?: boolean } = {}): void {
    const series = seriesRef.current
    const chart = chartRef.current
    if (!series || !chart) return

    const data = next ?? []
    const type = chartTypeRef.current

    if (type === 'heikinashi') {
      const ha = toHeikinAshi(data)
      haLastRef.current = ha.length > 0 ? ha[ha.length - 1] : null
    } else {
      haLastRef.current = null
    }

    series.setData(buildSeriesData(type, data) as never)

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

    const type = chartTypeRef.current
    let point: unknown

    if (type === 'heikinashi') {
      const ha = buildHeikinAshiPoint(haLastRef.current, candle)
      haLastRef.current = ha
      point = { time: ha.time as Time, open: ha.open, high: ha.high, low: ha.low, close: ha.close }
    } else if (type === 'line') {
      point = { time: candle.time as Time, value: candle.close }
    } else {
      point = {
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      }
    }

    series.update(point as never)
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

    const palette = CHART_PALETTES[theme]
    const chart = createChart(container, {
      width: container.clientWidth,
      height: Math.max(container.clientHeight, 1),
      ...chartThemeOptions(palette),
      crosshair: {
        mode: CrosshairMode.Normal
      },
      timeScale: {
        borderColor: palette.scaleBorder,
        timeVisible: true,
        secondsVisible: false
      }
    })

    const series = addSeries(chart, chartType)
    seriesTypeRef.current = chartType

    markersRef.current = createSeriesMarkers(series, [])
    watermarkRef.current = createTextWatermark(chart.panes()[0], {
      horzAlign: 'center',
      vertAlign: 'center',
      lines: [
        {
          text: '',
          color: palette.watermark,
          fontSize: 72,
          fontFamily: 'Segoe UI, sans-serif',
          fontStyle: '600'
        }
      ]
    })

    chartRef.current = chart
    seriesRef.current = series
    setChartReady({ chart, series })

    function getPriceScaleCell(): HTMLElement | null {
      const paneEl = chart.panes()[0]?.getHTMLElement()
      const cell = paneEl?.lastElementChild
      return cell instanceof HTMLElement ? cell : null
    }

    function reportPriceScaleWidth(): void {
      const cell = getPriceScaleCell()
      const width = cell ? cell.offsetWidth : 0
      if (width === priceScaleWidthRef.current) return
      priceScaleWidthRef.current = width
      onPriceScaleWidthChangeRef.current?.(width)
    }

    function attachPriceScaleObserver(): void {
      const cell = getPriceScaleCell()
      if (!cell) return
      if (priceScaleCellRef.current === cell) return
      priceScaleObserverRef.current?.disconnect()
      const observer = new ResizeObserver(() => reportPriceScaleWidth())
      observer.observe(cell)
      priceScaleObserverRef.current = observer
      priceScaleCellRef.current = cell
      reportPriceScaleWidth()
    }

    attachPriceScaleObserver()

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        chart.applyOptions({ width, height })
      }
      attachPriceScaleObserver()
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
      priceScaleObserverRef.current?.disconnect()
      priceScaleObserverRef.current = null
      priceScaleCellRef.current = null
      overlaySeriesRef.current.clear()
      markersRef.current = null
      watermarkRef.current = null
      setChartReady(null)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap the series in place when the chart type changes so the crosshair,
  // price scale, markers, and drawing overlay all keep working.
  useEffect(() => {
    const chart = chartRef.current
    const previous = seriesRef.current
    if (!chart) return
    if (seriesTypeRef.current === chartType) return

    const source = mode === 'replay' ? (visibleCandles ?? []) : (candles ?? [])
    const data = source ?? []

    const series = addSeries(chart, chartType)
    seriesTypeRef.current = chartType
    seriesRef.current = series

    if (chartType === 'heikinashi') {
      const ha = toHeikinAshi(data)
      haLastRef.current = ha.length > 0 ? ha[ha.length - 1] : null
    } else {
      haLastRef.current = null
    }

    series.setData(buildSeriesData(chartType, data) as never)

    markersRef.current = createSeriesMarkers(series, [])
    applyTradeMarkers()

    if (previous) {
      chart.removeSeries(previous)
    }

    setChartReady({ chart, series })

    if (data.length) {
      requestAnimationFrame(() => {
        if (chartRef.current !== chart || seriesRef.current !== series) return
        series.priceScale().applyOptions({ autoScale: true })
        chart.priceScale('right').applyOptions({ autoScale: true })
        focusLatestCandle(chart, data.length)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType])

  // Keep the text watermark in sync with the selected symbol and theme.
  useEffect(() => {
    const watermark = watermarkRef.current
    if (!watermark) return
    watermark.applyOptions({
      lines: [
        {
          text: symbol || '',
          color: CHART_PALETTES[theme].watermark,
          fontSize: 72,
          fontFamily: 'Segoe UI, sans-serif',
          fontStyle: '600'
        }
      ]
    })
  }, [symbol, theme])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const palette = CHART_PALETTES[theme]
    chart.applyOptions({
      ...chartThemeOptions(palette),
      timeScale: {
        borderColor: palette.scaleBorder
      }
    })
  }, [theme])

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

  function applyTradeMarkers(): void {
    const markersApi = markersRef.current
    if (!markersApi) return
    const markers = Array.isArray(tradeMarkers) ? tradeMarkers : []
    const source = mode === 'replay' ? (visibleCandles ?? []) : (candles ?? [])
    const knownTimes = new Set(source.map((c) => c.time))
    const sorted = markers
      .filter((m) => knownTimes.has(m.time))
      .sort((a, b) => a.time - b.time) as SeriesMarker<Time>[]
    markersApi.setMarkers(sorted)
  }

  useEffect(() => {
    applyTradeMarkers()
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
