import { useCallback, useEffect, useState } from 'react'
import type { IChartApi, ISeriesApi, Logical, SeriesType, Time } from 'lightweight-charts'
import { drawingDashArray } from '@/components/DrawingShapes'
import { plotRightX } from '@/lib/chart/drawingPlotBounds'
import {
  isTimeInSeriesRange,
  logicalToX,
  unixTimeToLogical
} from '@/lib/chart/drawingTimeScale'
import { ViewportBumpPrimitive } from '@/lib/chart/viewportBumpPrimitive'
import type { SmcBox, SmcLabel, SmcScene, SmcSegment } from '@/lib/smc/types'
import { alignTimeToInterval, DEFAULT_TIMEFRAME, TIMEFRAMES } from '@shared/timeframes'
import type { Candle } from '@shared/candleUtils'

type SmcOverlayProps = {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  paneTimeframe: string
  paneCandles: Candle[]
  scene: SmcScene
}

export default function SmcOverlay({
  chart,
  series,
  paneTimeframe,
  paneCandles,
  scene
}: SmcOverlayProps) {
  const [, setVersion] = useState(0)
  const intervalSeconds =
    TIMEFRAMES[paneTimeframe || '']?.seconds ?? TIMEFRAMES[DEFAULT_TIMEFRAME].seconds

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    if (!chart || !series) return undefined

    let raf = 0
    const scheduleBump = (): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        bump()
      })
    }

    const primitive = new ViewportBumpPrimitive(scheduleBump)
    series.attachPrimitive(primitive)
    const ro = new ResizeObserver(scheduleBump)
    const el = chart.chartElement()
    if (el) ro.observe(el)

    return () => {
      cancelAnimationFrame(raf)
      series.detachPrimitive(primitive)
      ro.disconnect()
    }
  }, [chart, series, bump])

  function mapTimeToPane(time: number): number {
    return alignTimeToInterval(time, intervalSeconds)
  }

  function timeToX(time: number): number | null {
    const exact = chart.timeScale().timeToCoordinate(time as Time)
    if (exact != null) return exact
    if (isTimeInSeriesRange(time, paneCandles, intervalSeconds)) {
      const aligned = mapTimeToPane(time)
      if (aligned !== time) {
        const alignedX = chart.timeScale().timeToCoordinate(aligned as Time)
        if (alignedX != null) return alignedX
      }
    }
    const logical = unixTimeToLogical(time, paneCandles, intervalSeconds)
    if (logical == null) return null
    return logicalToX(chart, logical)
  }

  const width = chart.chartElement()?.clientWidth ?? 0
  const height = chart.chartElement()?.clientHeight ?? 0
  const priceScaleW = chart.priceScale('right').width() ?? 56
  const plotRight = plotRightX(width, priceScaleW, chart.timeScale().width() ?? 0)
  const halfBar = barHalfWidth(chart)

  function point(time: number, price: number): { x: number; y: number } | null {
    const x = timeToX(time)
    const y = series.priceToCoordinate(price)
    if (x == null || y == null) return null
    return { x, y }
  }

  return (
    <svg
      data-snapshot-layer
      className="pointer-events-none absolute left-0 top-0 z-[2] h-full overflow-hidden"
      width={plotRight || 0}
      height={height || '100%'}
      style={{ width: plotRight }}
      aria-hidden
    >
      {scene.boxes.map((box, index) => (
        <BoxShape
          key={`box-${box.tag}-${box.t1}-${index}`}
          box={box}
          point={point}
          plotRight={plotRight}
          halfBar={halfBar}
        />
      ))}
      {scene.segments.map((segment, index) => (
        <SegmentShape
          key={`seg-${segment.layer}-${segment.t1}-${segment.t2}-${index}`}
          segment={segment}
          point={point}
          plotRight={plotRight}
        />
      ))}
      {scene.labels.map((label, index) => (
        <LabelShape
          key={`lbl-${label.text}-${label.t}-${index}`}
          label={label}
          point={point}
          plotRight={plotRight}
        />
      ))}
    </svg>
  )
}

function barHalfWidth(chart: IChartApi): number {
  const spacing = chart.timeScale().options().barSpacing
  if (Number.isFinite(spacing) && spacing > 0) return spacing / 2
  const x0 = chart.timeScale().logicalToCoordinate(0 as Logical)
  const x1 = chart.timeScale().logicalToCoordinate(1 as Logical)
  if (x0 != null && x1 != null && x1 !== x0) return Math.abs(x1 - x0) / 2
  return 3
}

function BoxShape({
  box,
  point,
  plotRight,
  halfBar
}: {
  box: SmcBox
  point: (time: number, price: number) => { x: number; y: number } | null
  plotRight: number
  halfBar: number
}) {
  const a = point(box.t1, box.p1)
  const b = point(box.t2, box.p2)
  if (!a || !b) return null
  const shift = box.fromBarRight ? halfBar : 0
  const x1 = a.x + shift
  const x2 = box.extendRight ? plotRight : b.x + shift
  const left = Math.min(x1, x2)
  const width = Math.max(0, Math.abs(x2 - x1))
  const top = Math.min(a.y, b.y)
  const height = Math.abs(a.y - b.y)
  if (width < 0.5 || height < 0.5) return null
  const midY = (a.y + b.y) / 2
  const stroke = box.border
  return (
    <g>
      <rect
        x={left}
        y={top}
        width={width}
        height={height}
        fill={box.fill}
        stroke={stroke ?? 'none'}
        strokeWidth={stroke ? 1 : 0}
      />
      {box.midline && stroke ? (
        <line
          x1={left}
          y1={midY}
          x2={left + width}
          y2={midY}
          stroke={stroke}
          strokeWidth={1}
        />
      ) : null}
    </g>
  )
}

function SegmentShape({
  segment,
  point,
  plotRight
}: {
  segment: SmcSegment
  point: (time: number, price: number) => { x: number; y: number } | null
  plotRight: number
}) {
  const a = point(segment.t1, segment.p1)
  if (!a) return null
  if (segment.extendRight) {
    if (!(plotRight > a.x)) return null
    return (
      <line
        x1={a.x}
        y1={a.y}
        x2={plotRight}
        y2={a.y}
        stroke={segment.color}
        strokeWidth={1.25}
        strokeDasharray={drawingDashArray({ lineStyle: segment.style === 'dashed' ? 2 : 0 })}
      />
    )
  }
  const b = point(segment.t2, segment.p2)
  if (!b) return null
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={segment.color}
      strokeWidth={1.25}
      strokeDasharray={drawingDashArray({ lineStyle: segment.style === 'dashed' ? 2 : 0 })}
    />
  )
}

function LabelShape({
  label,
  point,
  plotRight
}: {
  label: SmcLabel
  point: (time: number, price: number) => { x: number; y: number } | null
  plotRight: number
}) {
  const at = point(label.t, label.price)
  if (!at) return null
  const above = label.align === 'down'
  const atRight = label.atRight === true && plotRight > 0
  return (
    <text
      x={atRight ? Math.max(0, plotRight - 6) : at.x}
      y={above ? at.y - 4 : at.y + 11}
      fill={label.color}
      fontSize={10}
      fontWeight={600}
      textAnchor={atRight ? 'end' : 'middle'}
    >
      {label.text}
    </text>
  )
}
