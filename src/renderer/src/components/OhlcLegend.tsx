import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  BarData,
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  SeriesDataItemTypeMap,
  SeriesType,
  Time
} from 'lightweight-charts'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import { isLineData, sameBar, type LegendBar } from '@/lib/ohlcLegendBar'
import type { Candle } from '@shared/candleUtils'
import { formatAssetPrice } from '@shared/pricePrecision'

const UP_COLOR = '#22c55e'
const DOWN_COLOR = '#ef4444'

function toBar(candle: Candle): BarData<Time> {
  return {
    time: candle.time as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  }
}

function ohlcFrom(bar: BarData<Time>): Pick<BarData<Time>, 'open' | 'high' | 'low' | 'close'> {
  return { open: bar.open, high: bar.high, low: bar.low, close: bar.close }
}

function sameLastBarOhlc(a: Candle[], b: Candle[]): boolean {
  const la = a[a.length - 1]
  const lb = b[b.length - 1]
  if (la === lb) return true
  if (!la || !lb) return false
  return (
    la.time === lb.time &&
    la.open === lb.open &&
    la.high === lb.high &&
    la.low === lb.low &&
    la.close === lb.close
  )
}

type OhlcLegendProps = {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  /** Series bars on this pane — used to default to the latest candle. */
  candles: Candle[]
  pricePrecision: number
}

function ohlcLegendPropsEqual(prev: OhlcLegendProps, next: OhlcLegendProps): boolean {
  return (
    prev.chart === next.chart &&
    prev.series === next.series &&
    prev.pricePrecision === next.pricePrecision &&
    sameLastBarOhlc(prev.candles, next.candles)
  )
}

export default memo(function OhlcLegend({
  chart,
  series,
  candles,
  pricePrecision
}: OhlcLegendProps): ReactNode {
  const [bar, setBar] = useState<LegendBar | null>(null)
  const pinnedTimeRef = useRef<number | null>(null)
  const candlesRef = useRef(candles)
  candlesRef.current = candles

  const last = candles[candles.length - 1]
  const lastTime = last?.time
  const lastOpen = last?.open
  const lastHigh = last?.high
  const lastLow = last?.low
  const lastClose = last?.close

  useEffect(() => {
    const handler = (param: MouseEventParams<Time>): void => {
      const next = param.seriesData.get(series) as
        SeriesDataItemTypeMap<Time>[SeriesType] | undefined
      if (next) {
        pinnedTimeRef.current = next.time as number
        setBar((prev) => (sameBar(prev, next as LegendBar) ? prev : (next as LegendBar)))
      }
    }
    chart.subscribeCrosshairMove(handler)
    return () => {
      chart.unsubscribeCrosshairMove(handler)
    }
  }, [chart, series])

  useEffect(() => {
    const candles = candlesRef.current
    const last = candles[candles.length - 1]
    if (!last) return

    const pinned = pinnedTimeRef.current
    if (pinned != null && pinned !== last.time) {
      const pinnedCandle = candles.find((c) => c.time === pinned)
      if (pinnedCandle) {
        const next = toBar(pinnedCandle)
        setBar((prev) => (sameBar(prev, next) ? prev : next))
        return
      }
      pinnedTimeRef.current = null
    }

    const next = toBar(last)
    setBar((prev) => (sameBar(prev, next) ? prev : next))
  }, [lastTime, lastOpen, lastHigh, lastLow, lastClose])

  if (!bar) return null

  const line = isLineData(bar)
  const time = typeof bar.time === 'number' ? bar.time : Number(bar.time)

  return (
    <div className="flex select-none items-center gap-2.5 rounded border border-zinc-800/80 bg-zinc-950/80 px-2.5 py-1 text-[11px] font-medium tabular-nums backdrop-blur-sm">
      <span className="text-zinc-500">{formatUtcCandleTime(time)}</span>
      {line ? (
        <span className="flex items-center gap-1">
          <span className="text-zinc-500">Price</span>
          <span style={{ color: UP_COLOR }}>{formatAssetPrice(bar.value, pricePrecision)}</span>
        </span>
      ) : (
        (() => {
          const ohlc = ohlcFrom(bar)
          const up = ohlc.close >= ohlc.open
          const color = up ? UP_COLOR : DOWN_COLOR
          return (
            <>
              <span className="flex items-center gap-1">
                <span className="text-zinc-500">O</span>
                <span style={{ color }}>{formatAssetPrice(ohlc.open, pricePrecision)}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-zinc-500">H</span>
                <span style={{ color }}>{formatAssetPrice(ohlc.high, pricePrecision)}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-zinc-500">L</span>
                <span style={{ color }}>{formatAssetPrice(ohlc.low, pricePrecision)}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-zinc-500">C</span>
                <span style={{ color }}>{formatAssetPrice(ohlc.close, pricePrecision)}</span>
              </span>
            </>
          )
        })()
      )}
    </div>
  )
}, ohlcLegendPropsEqual)
