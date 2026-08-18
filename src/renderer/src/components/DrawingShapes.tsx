import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  FIB_LEVELS,
  fibPriceAtLevel,
  formatFibLevel,
  type RectHandle
} from '@/lib/chart/drawingGeometry'
import { fibLabelPlacement, fibLevelExtent } from '@/lib/chart/drawingPlotBounds'
import { DEFAULT_PRICE_PRECISION, formatAssetPrice } from '@shared/pricePrecision'

export const DRAW_STROKE = '#f23645'
export const DRAW_WIDTH = 2.5
export const HANDLE_FILL = '#2962ff'
export const HANDLE_STROKE = '#ffffff'
export const SELECT_STROKE = '#f59e0b'
const DRAW_FILL = 'rgba(242, 54, 69, 0.08)'
const FIB_ZONE = 'rgba(242, 54, 69, 0.06)'

export type Point = { x: number; y: number }

type HandleEvents = {
  onMouseDown?: (event: ReactMouseEvent) => void
  onClick?: (event: ReactMouseEvent) => void
}

function ink(selected: boolean): string {
  return selected ? SELECT_STROKE : DRAW_STROKE
}

export function HandleDot({
  x,
  y,
  selected,
  cursor,
  onMouseDown,
  onClick
}: {
  x: number
  y: number
  selected: boolean
  cursor: string
} & HandleEvents) {
  return (
    <circle
      cx={x}
      cy={y}
      r={4.5}
      fill={selected ? SELECT_STROKE : HANDLE_FILL}
      stroke={HANDLE_STROKE}
      strokeWidth={1.25}
      className={`pointer-events-auto ${cursor}`}
      onMouseDown={onMouseDown}
      onClick={onClick}
    />
  )
}

export function HandleSquare({
  x,
  y,
  selected,
  cursor,
  onMouseDown,
  onClick
}: {
  x: number
  y: number
  selected: boolean
  cursor: string
} & HandleEvents) {
  return (
    <rect
      x={x - 4.5}
      y={y - 4.5}
      width={9}
      height={9}
      rx={2}
      ry={2}
      fill={selected ? SELECT_STROKE : HANDLE_FILL}
      stroke={HANDLE_STROKE}
      strokeWidth={1.25}
      className={`pointer-events-auto ${cursor}`}
      onMouseDown={onMouseDown}
      onClick={onClick}
    />
  )
}

export function HLineShape({
  y,
  width,
  midX,
  selected,
  canSelect,
  canDraw,
  onSelect,
  onDrag
}: {
  y: number
  width: number
  midX: number
  selected: boolean
  canSelect: boolean
  canDraw: boolean
  onSelect: (event: ReactMouseEvent) => void
  onDrag: (event: ReactMouseEvent) => void
}) {
  const color = ink(selected)
  return (
    <g>
      <line x1={0} x2={width || '100%'} y1={y} y2={y} stroke={color} strokeWidth={DRAW_WIDTH} />
      {canDraw && (
        <line
          x1={0}
          x2={width || '100%'}
          y1={y}
          y2={y}
          stroke="transparent"
          strokeWidth={14}
          className="pointer-events-auto cursor-ns-resize"
          onMouseDown={onDrag}
          onClick={canSelect ? onSelect : undefined}
        />
      )}
      {canDraw && midX > 0 && (
        <HandleSquare
          x={midX}
          y={y}
          selected={selected}
          cursor="cursor-ns-resize"
          onMouseDown={onDrag}
          onClick={canSelect ? onSelect : undefined}
        />
      )}
    </g>
  )
}

export function TrendLineShape({
  a,
  b,
  selected,
  canSelect,
  canDraw,
  onSelect,
  onDragEnd,
  onDragBody
}: {
  a: Point
  b: Point
  selected: boolean
  canSelect: boolean
  canDraw: boolean
  onSelect: (event: ReactMouseEvent) => void
  onDragEnd: (end: 'start' | 'end', event: ReactMouseEvent) => void
  onDragBody: (event: ReactMouseEvent) => void
}) {
  const color = ink(selected)
  return (
    <g>
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={color}
        strokeWidth={DRAW_WIDTH}
      />
      {canDraw && (
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="transparent"
          strokeWidth={14}
          className="pointer-events-auto cursor-move"
          onMouseDown={onDragBody}
          onClick={canSelect ? onSelect : undefined}
        />
      )}
      {canDraw && (
        <>
          <HandleDot
            x={a.x}
            y={a.y}
            selected={selected}
            cursor="cursor-move"
            onMouseDown={(e) => onDragEnd('start', e)}
            onClick={canSelect ? onSelect : undefined}
          />
          <HandleDot
            x={b.x}
            y={b.y}
            selected={selected}
            cursor="cursor-move"
            onMouseDown={(e) => onDragEnd('end', e)}
            onClick={canSelect ? onSelect : undefined}
          />
        </>
      )}
    </g>
  )
}

export type FibLevelView = { ratio: number; y: number; price: number }

export function fibLevelsAt(p1: number, p2: number, priceToY: (price: number) => number | null): FibLevelView[] {
  const levels: FibLevelView[] = []
  for (const ratio of FIB_LEVELS) {
    const price = fibPriceAtLevel(p1, p2, ratio)
    const y = priceToY(price)
    if (y == null) continue
    levels.push({ ratio, y, price })
  }
  return levels
}

export function FibShape({
  a,
  b,
  levels,
  selected,
  labelColor,
  canSelect,
  canDraw,
  showHandles = true,
  pricePrecision = DEFAULT_PRICE_PRECISION,
  plotRight,
  onSelect,
  onDragEnd,
  onDragBody
}: {
  a: Point
  b: Point
  levels: FibLevelView[]
  selected: boolean
  labelColor: string
  canSelect: boolean
  canDraw: boolean
  showHandles?: boolean
  pricePrecision?: number
  /** Right edge of the candle pane; levels and labels stay left of the price scale. */
  plotRight?: number
  onSelect?: (event: ReactMouseEvent) => void
  onDragEnd?: (end: 'start' | 'end', event: ReactMouseEvent) => void
  onDragBody?: (event: ReactMouseEvent) => void
}) {
  const color = ink(selected)
  const { left: xLeft, right: lineRight } = fibLevelExtent(a.x, b.x, plotRight ?? 0)
  const span = Math.max(0, lineRight - xLeft)
  const label = fibLabelPlacement(lineRight, plotRight ?? 0)
  const sorted = [...levels].sort((l, r) => l.y - r.y)

  return (
    <g>
      {sorted.slice(0, -1).map((level, i) => {
        const next = sorted[i + 1]
        if (!next) return null
        return (
          <rect
            key={`zone-${level.ratio}`}
            x={xLeft}
            y={level.y}
            width={span}
            height={Math.max(0, next.y - level.y)}
            fill={FIB_ZONE}
            className="pointer-events-none"
          />
        )
      })}
      {levels.map((level) => (
        <g key={`lv-${level.ratio}`}>
          <line
            x1={xLeft}
            x2={lineRight}
            y1={level.y}
            y2={level.y}
            stroke={color}
            strokeWidth={level.ratio === 0 || level.ratio === 1 ? DRAW_WIDTH : 1.25}
            strokeOpacity={level.ratio === 0 || level.ratio === 1 ? 1 : 0.85}
          />
          <text
            x={label.x}
            y={level.y + 3.5}
            textAnchor={label.textAnchor}
            fill={labelColor}
            fontSize={10}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            className="pointer-events-none select-none"
          >
            {formatFibLevel(level.ratio)} ({formatAssetPrice(level.price, pricePrecision)})
          </text>
        </g>
      ))}
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={color}
        strokeWidth={DRAW_WIDTH}
        strokeDasharray="4 3"
      />
      {canDraw && sorted.length > 0 && (
        <rect
          x={xLeft}
          y={sorted[0].y}
          width={span}
          height={Math.max(1, sorted[sorted.length - 1].y - sorted[0].y)}
          fill="transparent"
          className="pointer-events-auto cursor-move"
          onMouseDown={onDragBody}
          onClick={canSelect ? onSelect : undefined}
        />
      )}
      {canDraw && (
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="transparent"
          strokeWidth={16}
          className="pointer-events-auto cursor-move"
          onMouseDown={onDragBody}
          onClick={canSelect ? onSelect : undefined}
        />
      )}
      {canDraw && showHandles && onDragEnd && (
        <>
          <HandleDot
            x={a.x}
            y={a.y}
            selected={selected}
            cursor="cursor-move"
            onMouseDown={(e) => onDragEnd('start', e)}
            onClick={canSelect ? onSelect : undefined}
          />
          <HandleDot
            x={b.x}
            y={b.y}
            selected={selected}
            cursor="cursor-move"
            onMouseDown={(e) => onDragEnd('end', e)}
            onClick={canSelect ? onSelect : undefined}
          />
        </>
      )}
    </g>
  )
}

export function RectShape({
  a,
  b,
  selected,
  canSelect,
  canDraw,
  showHandles = true,
  onSelect,
  onDragHandle,
  onDragBody
}: {
  a: Point
  b: Point
  selected: boolean
  canSelect: boolean
  canDraw: boolean
  showHandles?: boolean
  onSelect?: (event: ReactMouseEvent) => void
  onDragHandle?: (handle: RectHandle, event: ReactMouseEvent) => void
  onDragBody?: (event: ReactMouseEvent) => void
}) {
  const color = ink(selected)
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.abs(b.x - a.x)
  const h = Math.abs(b.y - a.y)
  const corners: { handle: RectHandle; x: number; y: number }[] = [
    { handle: 'nw', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    { handle: 'ne', x: Math.max(a.x, b.x), y: Math.min(a.y, b.y) },
    { handle: 'sw', x: Math.min(a.x, b.x), y: Math.max(a.y, b.y) },
    { handle: 'se', x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }
  ]

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={DRAW_FILL}
        stroke={color}
        strokeWidth={DRAW_WIDTH}
      />
      {canDraw && (
        <rect
          x={x}
          y={y}
          width={Math.max(w, 1)}
          height={Math.max(h, 1)}
          fill="transparent"
          className="pointer-events-auto cursor-move"
          onMouseDown={onDragBody}
          onClick={canSelect ? onSelect : undefined}
        />
      )}
      {canDraw && showHandles && onDragHandle &&
        corners.map((corner) => (
          <HandleDot
            key={corner.handle}
            x={corner.x}
            y={corner.y}
            selected={selected}
            cursor={
              corner.handle === 'nw' || corner.handle === 'se'
                ? 'cursor-nwse-resize'
                : 'cursor-nesw-resize'
            }
            onMouseDown={(e) => onDragHandle(corner.handle, e)}
            onClick={canSelect ? onSelect : undefined}
          />
        ))}
    </g>
  )
}
