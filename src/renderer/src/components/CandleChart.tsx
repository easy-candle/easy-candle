import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  createTextWatermark,
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
import { themedWordmarkUrl } from '@/lib/chartWordmark'
import type { ChartOverlay } from '@/lib/indicators'
import {
  buildHeikinAshiPoint,
  buildSeriesData,
  toHeikinAshi,
  type ChartType
} from '@/lib/chart/chartTypes'
import type { Candle } from '@shared/candleUtils'
import { resolvePricePrecision, toChartPriceFormat } from '@shared/pricePrecision'
import { type ChartPalette } from '@/lib/theme'
import { resolveChartPalette, useChartSettingsStore } from '@/store/chartSettingsStore'
import { useThemeStore } from '@/store/themeStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import type { ChartSync, TradeMarker, ViewMode } from '@/store/replayStore'

const DEFAULT_VISIBLE_BARS = 50

function chartThemeOptions(palette: ChartPalette): {
  layout: {
    background: { type: ColorType.Solid; color: string }
    textColor: string
  }
  grid: { vertLines: { color: string }; horzLines: { color: string } }
} {
  return {
    layout: {
      background: { type: ColorType.Solid, color: palette.background },
      textColor: palette.text
    },
    grid: {
      vertLines: { color: palette.grid },
      horzLines: { color: palette.grid }
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

function addSeries(
  chart: IChartApi,
  type: ChartType,
  precision: number,
  palette: ReturnType<typeof resolveChartPalette>
): ISeriesApi<SeriesType> {
  const priceFormat = toChartPriceFormat(precision)
  switch (type) {
    case 'line':
      return chart.addSeries(LineSeries, {
        color: palette.lineColor,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        priceFormat
      })
    case 'bar':
      return chart.addSeries(BarSeries, {
        upColor: palette.upColor,
        downColor: palette.downColor,
        thinBars: false,
        priceFormat
      })
    case 'heikinashi':
    case 'candlestick':
    default:
      return chart.addSeries(CandlestickSeries, {
        upColor: palette.upColor,
        downColor: palette.downColor,
        borderUpColor: palette.borderUpColor,
        borderDownColor: palette.borderDownColor,
        wickUpColor: palette.wickUpColor,
        wickDownColor: palette.wickDownColor,
        priceFormat
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
  /** Whether this is the primary (left) chart; it gets registered for snapshots. */
  isPrimary?: boolean
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
  onPriceScaleWidthChange,
  isPrimary = false
}: CandleChartProps) {
  const theme = useThemeStore((s) => s.theme)
  const chartSettings = useChartSettingsStore()
  const colorOverrides = useChartSettingsStore((s) => s.colors)
  const palette = useMemo(() => resolveChartPalette(theme, colorOverrides), [theme, colorOverrides])
  const setPrimaryChart = useUiLayoutStore((s) => s.setPrimaryChart)
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
<<<<<<< HEAD
  const pricePrecision = useMemo(
    () => resolvePricePrecision(symbol, candles ?? visibleCandles),
    [symbol, candles, visibleCandles]
  )
  const pricePrecisionRef = useRef(pricePrecision)
  pricePrecisionRef.current = pricePrecision
=======
  const haPrevRef = useRef<Candle | null>(null)
>>>>>>> 3961e3c (Add MetaTrader integration and enhance import functionality)
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
      haPrevRef.current = ha.length > 1 ? ha[ha.length - 2] : null
    } else {
      haLastRef.current = null
      haPrevRef.current = null
    }

    series.setData(buildSeriesData(type, data) as never)

    if (opts.fitContent !== false && data.length) {
      requestAnimationFrame(() => {
        if (chartRef.current !== chart || seriesRef.current !== series) return
        // Re-enable autoscaling after symbol/price-range changes (e.g. BNB → XAU).
        const autoScale = useChartSettingsStore.getState().priceScale.autoScale
        series.priceScale().applyOptions({ autoScale })
        chart.priceScale('right').applyOptions({ autoScale })
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
      const lastHa = haLastRef.current
      const prev =
        lastHa && lastHa.time === candle.time ? haPrevRef.current : lastHa
      if (lastHa && lastHa.time !== candle.time) {
        haPrevRef.current = lastHa
      }
      const ha = buildHeikinAshiPoint(prev, candle)
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
          crosshairMarkerVisible: false,
          priceFormat: toChartPriceFormat(pricePrecisionRef.current)
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

    const settings = useChartSettingsStore.getState()
    const chart = createChart(container, {
      width: container.clientWidth,
      height: Math.max(container.clientHeight, 1),
      ...chartThemeOptions(palette),
      rightPriceScale: {
        borderColor: palette.scaleBorder,
        mode: settings.priceScale.mode,
        invertScale: settings.priceScale.invertScale,
        autoScale: settings.priceScale.autoScale
      },
      crosshair: {
        mode: settings.crosshair.mode,
        vertLine: {
          color: palette.crosshairColor,
          style: settings.crosshair.lineStyle,
          width: settings.crosshair.lineWidth,
          visible: settings.crosshair.visible,
          labelVisible: settings.crosshair.labelVisible
        },
        horzLine: {
          color: palette.crosshairColor,
          style: settings.crosshair.lineStyle,
          width: settings.crosshair.lineWidth,
          visible: settings.crosshair.visible,
          labelVisible: settings.crosshair.labelVisible
        }
      },
      timeScale: {
        borderColor: palette.scaleBorder,
        timeVisible: settings.timeScale.timeVisible,
        secondsVisible: settings.timeScale.secondsVisible
      }
    })

    const series = addSeries(chart, chartType, pricePrecisionRef.current, palette)
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
    if (isPrimary) {
      setPrimaryChart(chart)
    }

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
      if (isPrimary) {
        setPrimaryChart(null)
      }
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

    const series = addSeries(chart, chartType, pricePrecisionRef.current, palette)
    seriesTypeRef.current = chartType
    seriesRef.current = series

    if (chartType === 'heikinashi') {
      const ha = toHeikinAshi(data)
      haLastRef.current = ha.length > 0 ? ha[ha.length - 1] : null
      haPrevRef.current = ha.length > 1 ? ha[ha.length - 2] : null
    } else {
      haLastRef.current = null
      haPrevRef.current = null
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
        const autoScale = useChartSettingsStore.getState().priceScale.autoScale
        series.priceScale().applyOptions({ autoScale })
        chart.priceScale('right').applyOptions({ autoScale })
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
          color: palette.watermark,
          fontSize: 72,
          fontFamily: 'Segoe UI, sans-serif',
          fontStyle: '600'
        }
      ]
    })
  }, [symbol, palette.watermark])

  // Apply theme + chart settings to the chart, scales, and crosshair.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const settings = useChartSettingsStore.getState()
    chart.applyOptions({
      ...chartThemeOptions(palette),
      rightPriceScale: {
        borderColor: palette.scaleBorder,
        mode: settings.priceScale.mode,
        invertScale: settings.priceScale.invertScale,
        autoScale: settings.priceScale.autoScale
      },
      timeScale: {
        borderColor: palette.scaleBorder,
        timeVisible: settings.timeScale.timeVisible,
        secondsVisible: settings.timeScale.secondsVisible
      },
      crosshair: {
        mode: settings.crosshair.mode,
        vertLine: {
          color: palette.crosshairColor,
          style: settings.crosshair.lineStyle,
          width: settings.crosshair.lineWidth,
          visible: settings.crosshair.visible,
          labelVisible: settings.crosshair.labelVisible
        },
        horzLine: {
          color: palette.crosshairColor,
          style: settings.crosshair.lineStyle,
          width: settings.crosshair.lineWidth,
          visible: settings.crosshair.visible,
          labelVisible: settings.crosshair.labelVisible
        }
      }
    })
  }, [theme, chartSettings, palette])

  // Keep the main series colors in sync with the chart settings.
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    series.applyOptions({
      upColor: palette.upColor,
      downColor: palette.downColor,
      borderUpColor: palette.borderUpColor,
      borderDownColor: palette.borderDownColor,
      wickUpColor: palette.wickUpColor,
      wickDownColor: palette.wickDownColor,
      color: palette.lineColor
    } as never)
  }, [palette])

  useEffect(() => {
    const format = toChartPriceFormat(pricePrecision)
    seriesRef.current?.applyOptions({ priceFormat: format })
    for (const overlay of overlaySeriesRef.current.values()) {
      overlay.applyOptions({ priceFormat: format })
    }
  }, [pricePrecision])

  useEffect(() => {
    if (mode !== 'live') return
    if (chartSync?.kind === 'append' && currentCandle) {
      append(currentCandle)
      return
    }
    reset(candles ?? [], { fitContent: chartSync?.fitContent !== false })
  }, [mode, candles, symbol, chartSync?.kind, chartSync?.revision, currentCandle])

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
        src={themedWordmarkUrl(theme)}
        alt=""
        className="pointer-events-none absolute left-1/2 top-[58%] z-[1] h-auto w-[min(48%,380px)] -translate-x-1/2 -translate-y-1/2 opacity-[0.08] select-none"
        aria-hidden
      />
      {chartReady && (
        <>
          <OhlcLegend
            chart={chartReady.chart}
            series={chartReady.series}
            candles={seriesCandles}
            pricePrecision={pricePrecision}
          />
          <DrawingOverlay
            chart={chartReady.chart}
            series={chartReady.series}
            paneTimeframe={timeframe}
            paneCurrentCandle={currentCandle}
            paneCandles={seriesCandles}
            pricePrecision={pricePrecision}
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
