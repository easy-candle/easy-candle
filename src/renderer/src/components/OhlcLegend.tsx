import { useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  BarData,
  IChartApi,
  ISeriesApi,
  LineData,
  MouseEventParams,
  SeriesDataItemTypeMap,
  SeriesType,
  Time
} from 'lightweight-charts'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import type { Candle } from '@shared/candleUtils'
import { formatAssetPrice } from '@shared/pricePrecision'

const UP_COLOR = '#22c55e'
const DOWN_COLOR = '#ef4444'

type LegendBar = BarData<Time> | LineData<Time>

function toBar(candle: Candle): BarData<Time> {
  return {
    time: candle.time as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  }
}

function isLineData(bar: LegendBar): bar is LineData<Time> {
  return 'value' in bar
}

function ohlcFrom(bar: BarData<Time>): Pick<BarData<Time>, 'open' | 'high' | 'low' | 'close'> {
  return { open: bar.open, high: bar.high, low: bar.low, close: bar.close }
}

type OhlcLegendProps = {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  /** Series bars on this pane — used to default to the latest candle. */
  candles: Candle[]
  pricePrecision: number
}

export default function OhlcLegend({
  chart,
  series,
  candles,
  pricePrecision
}: OhlcLegendProps): ReactNode {
  const [bar, setBar] = useState<LegendBar | null>(null)
  const pinnedTimeRef = useRef<number | null>(null)

  useEffect(() => {
    const handler = (param: MouseEventParams<Time>): void => {
      const next = param.seriesData.get(series) as
        SeriesDataItemTypeMap<Time>[SeriesType] | undefined
      if (next) {
        pinnedTimeRef.current = next.time as number
        setBar(next as LegendBar)
      }
    }
    chart.subscribeCrosshairMove(handler)
    return () => {
      chart.unsubscribeCrosshairMove(handler)
    }
  }, [chart, series])

  useEffect(() => {
    const last = candles[candles.length - 1]
    if (!last) return

    const pinned = pinnedTimeRef.current
    if (pinned != null) {
      if (candles.some((c) => c.time === pinned)) return
      pinnedTimeRef.current = null
    }

    setBar((prev) => (prev && prev.time === last.time ? prev : toBar(last)))
  }, [candles])

  if (!bar) return null

  const line = isLineData(bar)
  const time = typeof bar.time === 'number' ? bar.time : Number(bar.time)

  return (
    <div className="pointer-events-none absolute left-1 top-1 z-[5] flex select-none items-center gap-2.5 rounded border border-zinc-800/80 bg-zinc-950/80 px-2.5 py-1 text-[11px] font-medium tabular-nums backdrop-blur-sm">
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
}
