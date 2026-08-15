import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BarData, IChartApi, ISeriesApi, MouseEventParams, Time } from 'lightweight-charts'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import type { Candle } from '@shared/candleUtils'

const UP_COLOR = '#22c55e'
const DOWN_COLOR = '#ef4444'

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs >= 1) return value.toFixed(2)
  return value.toFixed(6)
}

function toBar(candle: Candle): BarData<Time> {
  return {
    time: candle.time as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  }
}

type OhlcLegendProps = {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  /** Series bars on this pane — used to default to the latest candle. */
  candles: Candle[]
}

export default function OhlcLegend({ chart, series, candles }: OhlcLegendProps): ReactNode {
  const [bar, setBar] = useState<BarData<Time> | null>(null)
  const pinnedTimeRef = useRef<number | null>(null)

  useEffect(() => {
    const handler = (param: MouseEventParams<Time>): void => {
      const next = (param.seriesData.get(series) as BarData<Time> | undefined) ?? null
      if (next) {
        pinnedTimeRef.current = next.time as number
        setBar(next)
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

  const up = bar.close >= bar.open
  const color = up ? UP_COLOR : DOWN_COLOR
  const time = typeof bar.time === 'number' ? bar.time : Number(bar.time)

  return (
    <div className="pointer-events-none absolute left-1 top-1 z-[5] flex select-none items-center gap-2.5 rounded border border-zinc-800/80 bg-zinc-950/80 px-2.5 py-1 text-[11px] font-medium tabular-nums shadow-lg shadow-black/30 backdrop-blur-sm">
      <span className="text-zinc-500">{formatUtcCandleTime(time)}</span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-500">O</span>
        <span style={{ color }}>{formatPrice(bar.open)}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-500">H</span>
        <span style={{ color }}>{formatPrice(bar.high)}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-500">L</span>
        <span style={{ color }}>{formatPrice(bar.low)}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-500">C</span>
        <span style={{ color }}>{formatPrice(bar.close)}</span>
      </span>
    </div>
  )
}
