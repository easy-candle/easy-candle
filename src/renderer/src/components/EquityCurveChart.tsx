import { useMemo, useState } from 'react'
import type { ClosedTrade } from '@/lib/paperTrade'
import { formatPnl } from '@/lib/paperTrade'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import {
  buildEquityCurve,
  curveAreaPath,
  curveExtent,
  curvePolyline,
  projectPoint,
  valueTicks,
  type EquityPoint,
  type PlotBox
} from '@/lib/equityCurve'

/**
 * Fixed viewBox: the SVG scales to its container, so the geometry only needs to
 * be internally consistent. Left padding fits the value labels, bottom the dates.
 */
const BOX: PlotBox = {
  width: 640,
  height: 200,
  padding: { top: 12, right: 12, bottom: 26, left: 52 }
}

function shortUtcDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(5, 16).replace('T', ' ')
}

/** Cumulative realized PnL over time, as a line chart with a zero baseline. */
export default function EquityCurveChart({ trades }: { trades: ClosedTrade[] }) {
  const [hovered, setHovered] = useState<EquityPoint | null>(null)

  const curve = useMemo(() => buildEquityCurve(trades), [trades])
  const extent = useMemo(() => curveExtent(curve), [curve])

  // A single trade still yields a baseline + one step, so this only hits when
  // every trade was filtered out as malformed.
  if (!extent || curve.length < 2) {
    return (
      <p className="py-6 text-center text-[11px] text-zinc-600">
        Not enough closed trades to plot an account curve.
      </p>
    )
  }

  const final = curve[curve.length - 1]
  const positive = final.value >= 0
  const stroke = positive ? '#34d399' : '#f87171'
  const fill = positive ? 'rgba(52, 211, 153, 0.12)' : 'rgba(248, 113, 113, 0.12)'

  const plotRight = BOX.width - BOX.padding.right
  const ticks = valueTicks(extent)

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        className="h-56 w-full"
        role="img"
        aria-label={`Account curve: realized PnL ${formatPnl(final.value)} over ${final.tradeCount} closed trades`}
        onMouseLeave={() => setHovered(null)}
      >
        {ticks.map((tick) => {
          const y = projectPoint({ time: 0, value: tick, tradeCount: 0 }, extent, BOX).y
          const isZero = tick === 0
          return (
            <g key={tick}>
              <line
                x1={BOX.padding.left}
                x2={plotRight}
                y1={y}
                y2={y}
                stroke={isZero ? '#52525b' : '#27272a'}
                strokeWidth={1}
                strokeDasharray={isZero ? undefined : '3 3'}
              />
              <text
                x={BOX.padding.left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-zinc-600 text-[9px] tabular-nums"
              >
                {formatPnl(tick)}
              </text>
            </g>
          )
        })}

        <path d={curveAreaPath(curve, extent, BOX)} fill={fill} stroke="none" />
        <polyline
          points={curvePolyline(curve, extent, BOX)}
          fill="none"
          stroke={stroke}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {curve.map((point) => {
          const { x, y } = projectPoint(point, extent, BOX)
          const active = hovered?.tradeCount === point.tradeCount
          return (
            <circle
              key={`${point.time}-${point.tradeCount}`}
              cx={x}
              cy={y}
              r={active ? 3.5 : 2}
              fill={active ? stroke : '#18181b'}
              stroke={stroke}
              strokeWidth={1.25}
              onMouseEnter={() => setHovered(point)}
            />
          )
        })}

        <text
          x={BOX.padding.left}
          y={BOX.height - 8}
          className="fill-zinc-600 text-[9px] tabular-nums"
        >
          {shortUtcDate(extent.minTime)}
        </text>
        <text
          x={plotRight}
          y={BOX.height - 8}
          textAnchor="end"
          className="fill-zinc-600 text-[9px] tabular-nums"
        >
          {shortUtcDate(extent.maxTime)}
        </text>
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-zinc-500">
        {hovered && hovered.tradeCount > 0 ? (
          <>
            <span>
              Trade {hovered.tradeCount} of {final.tradeCount}
            </span>
            <span className={hovered.value >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {formatPnl(hovered.value)}
            </span>
            <span className="text-zinc-600">{formatUtcCandleTime(hovered.time)}</span>
          </>
        ) : (
          <>
            <span>
              {final.tradeCount} closed trade{final.tradeCount === 1 ? '' : 's'}
            </span>
            <span className={positive ? 'text-emerald-400' : 'text-red-400'}>
              {formatPnl(final.value)} realized
            </span>
            <span className="text-zinc-600">Hover a point for its running total</span>
          </>
        )}
      </figcaption>
    </figure>
  )
}
