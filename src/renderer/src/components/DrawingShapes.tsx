import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  FIB_LEVELS,
  fibPriceAtLevel,
  formatFibLevel,
  formatPriceChangePct,
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
export const LONG_COLOR = '#10B981'
export const SHORT_COLOR = '#F23645'
export const TP_ZONE_COLOR = '#26A69A'
export const SL_ZONE_COLOR = '#EF5350'
const TP_ZONE_FILL = 'rgba(38, 166, 154, 0.16)'
const SL_ZONE_FILL = 'rgba(239, 83, 80, 0.16)'

/** 3 → "3", 3.5 → "3.5", 12.4 → "12" (integers keep no trailing zero). */
function formatRr(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded >= 10 ? rounded.toFixed(0) : rounded.toFixed(1)
}

export type Point = { x: number; y: number }

type HandleEvents = {
  onMouseDown?: (event: ReactMouseEvent) => void
  onClick?: (event: ReactMouseEvent) => void
}

const POS_BADGE_MIN_W = 52
const POS_BADGE_H = 20
/** Side padding so a centered TP/SL badge isn't flush with the box edge. */
export const POS_BADGE_INSET = 16

export function posBadgeWidth(text: string): number {
  return Math.max(POS_BADGE_MIN_W, 14 + text.length * 6.4)
}

export function positionLevelLabel(
  price: number,
  entry: number,
  side: 'long' | 'short',
  precision: number
): string {
  return `${formatAssetPrice(price, precision)} (${formatPriceChangePct(entry, price, side)})`
}

function badgeLeft(boxX: number, boxW: number, badgeW: number): number {
  return Math.max(boxX, Math.min(boxX + (boxW - badgeW) / 2, boxX + boxW - badgeW))
}

function PositionBadge({
  x,
  y,
  text,
  fill,
  cursor,
  onMouseDown,
  onClick
}: {
  x: number
  y: number
  text: string
  fill: string
  cursor: string
} & HandleEvents): React.JSX.Element {
  const w = posBadgeWidth(text)
  return (
    <g className={`pointer-events-auto ${cursor}`} onMouseDown={onMouseDown} onClick={onClick}>
      <rect x={x} y={y} width={w} height={POS_BADGE_H} rx={3} ry={3} fill={fill} />
      <text
        x={x + w / 2}
        y={y + POS_BADGE_H / 2 + 3.5}
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize={10}
        fontWeight={700}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        className="pointer-events-none select-none"
      >
        {text}
      </text>
    </g>
  )
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
  showHandles = true,
  onMouseEnter,
  onMouseLeave,
  onSelect,
  onDrag
}: {
  y: number
  width: number
  midX: number
  selected: boolean
  canSelect: boolean
  canDraw: boolean
  showHandles?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onSelect: (event: ReactMouseEvent) => void
  onDrag: (event: ReactMouseEvent) => void
}) {
  const color = ink(selected)
  return (
    <g onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
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
      {canDraw && showHandles && midX > 0 && (
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
  showHandles = true,
  onMouseEnter,
  onMouseLeave,
  onSelect,
  onDragEnd,
  onDragBody
}: {
  a: Point
  b: Point
  selected: boolean
  canSelect: boolean
  canDraw: boolean
  showHandles?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onSelect: (event: ReactMouseEvent) => void
  onDragEnd: (end: 'start' | 'end', event: ReactMouseEvent) => void
  onDragBody: (event: ReactMouseEvent) => void
}) {
  const color = ink(selected)
  return (
    <g onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
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
      {canDraw && showHandles && (
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
  onMouseEnter,
  onMouseLeave,
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
  onMouseEnter?: () => void
  onMouseLeave?: () => void
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
    <g onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
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
  onMouseEnter,
  onMouseLeave,
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
  onMouseEnter?: () => void
  onMouseLeave?: () => void
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
    <g onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
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

type PositionShapeProps = {
  side: 'long' | 'short'
  /** Left edge (entry time anchor) and right edge of the box, in px. */
  x: number
  x2: number
  entryY: number
  targetY: number | null
  stopY: number | null
  entryPrice: number
  targetPrice: number | null
  stopPrice: number | null
  /** Box vertical extent (top/bottom y). */
  topY: number
  bottomY: number
  selected: boolean
  canSelect: boolean
  canDraw: boolean
  showHandles?: boolean
  pricePrecision?: number
  /** Live price line from the entry point to the current candle (clamped to the box). */
  priceLine?: { x1: number; y1: number; x2: number; y2: number } | null
  priceLineTowardTp?: boolean
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onSelect?: (event: ReactMouseEvent) => void
  onDragBox?: (event: ReactMouseEvent) => void
  onDragEntry?: (event: ReactMouseEvent) => void
  onDragTarget?: (event: ReactMouseEvent) => void
  onDragStop?: (event: ReactMouseEvent) => void
}

/** TradingView-style Long/Short position box: entry + TP/SL edges, whole box movable. */
export function PositionShape({
  side,
  x,
  x2,
  entryY,
  targetY,
  stopY,
  entryPrice,
  targetPrice,
  stopPrice,
  topY,
  bottomY,
  selected,
  canSelect,
  canDraw,
  showHandles = true,
  pricePrecision = DEFAULT_PRICE_PRECISION,
  priceLine = null,
  priceLineTowardTp = true,
  onMouseEnter,
  onMouseLeave,
  onSelect,
  onDragBox,
  onDragEntry,
  onDragTarget,
  onDragStop
}: PositionShapeProps) {
  const color = side === 'long' ? LONG_COLOR : SHORT_COLOR
  const fill = side === 'long' ? 'rgba(16, 185, 129, 0.10)' : 'rgba(242, 54, 69, 0.10)'
  const label = side === 'long' ? 'Long' : 'Short'
  const boxW = Math.max(0, x2 - x)
  const boxH = Math.max(0, bottomY - topY)
  const hasLevels = targetY != null || stopY != null
  // Zone backgrounds: TP zone between entry↔target (green), SL zone between entry↔stop (red).
  const tpZone =
    targetY == null
      ? null
      : { y: Math.min(entryY, targetY), h: Math.abs(targetY - entryY) }
  const slZone =
    stopY == null
      ? null
      : { y: Math.min(entryY, stopY), h: Math.abs(stopY - entryY) }
  // Risk→reward from the two zone spans (linear axis → pixel ratio == price ratio).
  const reward = targetY == null ? null : Math.abs(targetY - entryY)
  const risk = stopY == null ? null : Math.abs(stopY - entryY)
  const ratioText =
    reward != null && risk != null && risk > 0
      ? `1:${formatRr(reward / risk)}`
      : label
  // Live progress toward TP/SL when the marker is inside the box: distance
  // travelled from entry expressed as a multiple of risk.
  const liveRr =
    priceLine != null && stopY != null && Math.abs(stopY - entryY) > 0
      ? Math.abs(priceLine.y2 - entryY) / Math.abs(stopY - entryY)
      : null
  const badgeText =
    liveRr != null ? `1:${formatRr(liveRr)} / ${ratioText}` : ratioText
  const badgeW = posBadgeWidth(badgeText)
  const badgeX = badgeLeft(x, boxW, badgeW)
  const badgeY = side === 'long' ? Math.max(2, entryY - POS_BADGE_H - 6) : entryY + 6
  const tpText =
    targetPrice == null ? null : positionLevelLabel(targetPrice, entryPrice, side, pricePrecision)
  const slText =
    stopPrice == null ? null : positionLevelLabel(stopPrice, entryPrice, side, pricePrecision)
  const levelCursor = canDraw ? 'cursor-ns-resize' : 'cursor-default'

  const levelDragLine = (
    y: number,
    onDrag: ((event: ReactMouseEvent) => void) | undefined
  ): React.JSX.Element => (
    <line
      x1={x}
      x2={x2}
      y1={y}
      y2={y}
      stroke="transparent"
      strokeWidth={10}
      className="pointer-events-auto cursor-ns-resize"
      onMouseDown={onDrag}
      onClick={canSelect ? onSelect : undefined}
    />
  )

  return (
    <g onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {/* Zone backgrounds instead of a border: green TP box, red SL box. */}
      {hasLevels ? (
        <>
          {tpZone != null && tpZone.h > 0 && (
            <rect
              x={x}
              y={tpZone.y}
              width={boxW}
              height={tpZone.h}
              fill={TP_ZONE_FILL}
            />
          )}
          {slZone != null && slZone.h > 0 && (
            <rect
              x={x}
              y={slZone.y}
              width={boxW}
              height={slZone.h}
              fill={SL_ZONE_FILL}
            />
          )}
        </>
      ) : (
        // No levels yet: just the side-colored background, no border.
        <rect
          x={x}
          y={topY}
          width={boxW}
          height={Math.max(boxH, 1)}
          fill={fill}
          className="pointer-events-none"
        />
      )}

      {/* Pane-wide box body drag → moves the whole position (time + price). */}
      {canDraw && (
        <rect
          x={x}
          y={topY}
          width={Math.max(boxW, 1)}
          height={Math.max(boxH, 1)}
          fill="transparent"
          className="pointer-events-auto cursor-move"
          onMouseDown={onDragBox}
          onClick={canSelect ? onSelect : undefined}
        />
      )}

      {/* Entry line — draggable to move just the entry price. */}
      <line x1={x} x2={x2} y1={entryY} y2={entryY} stroke={color} strokeWidth={1.5} />

      {/* Level/entry drag surfaces (grabbing the line moves that level). */}
      {canDraw && (
        <>
          {targetY != null && levelDragLine(targetY, onDragTarget)}
          {stopY != null && levelDragLine(stopY, onDragStop)}
          {levelDragLine(entryY, onDragEntry)}
        </>
      )}

      {/* Live price line: from the entry point to the current candle. Red while the
        price sits in the SL zone, green in the TP zone. */}
      {priceLine && (
        <line
          x1={priceLine.x1}
          y1={priceLine.y1}
          x2={priceLine.x2}
          y2={priceLine.y2}
          stroke={priceLineTowardTp ? TP_ZONE_COLOR : SL_ZONE_COLOR}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          className="pointer-events-none"
        />
      )}

      {/* Badge with side + size — draggable to move the whole position. */}
      <PositionBadge
        x={badgeX}
        y={badgeY}
        text={badgeText}
        fill={selected ? SELECT_STROKE : color}
        cursor={canDraw ? 'cursor-move' : 'cursor-default'}
        onMouseDown={onDragBox}
        onClick={canSelect ? onSelect : undefined}
      />

      {targetY != null && tpText != null && (
        <PositionBadge
          x={badgeLeft(x, boxW, posBadgeWidth(tpText))}
          y={targetY - POS_BADGE_H / 2}
          text={tpText}
          fill={TP_ZONE_COLOR}
          cursor={levelCursor}
          onMouseDown={onDragTarget}
          onClick={canSelect ? onSelect : undefined}
        />
      )}
      {stopY != null && slText != null && (
        <PositionBadge
          x={badgeLeft(x, boxW, posBadgeWidth(slText))}
          y={stopY - POS_BADGE_H / 2}
          text={slText}
          fill={SL_ZONE_COLOR}
          cursor={levelCursor}
          onMouseDown={onDragStop}
          onClick={canSelect ? onSelect : undefined}
        />
      )}

      {/* Level handles for dragging — right edge so they stay off the centered badges. */}
      {canDraw && showHandles && targetY != null && (
        <HandleSquare
          x={x2}
          y={targetY}
          selected={selected}
          cursor="cursor-ns-resize"
          onMouseDown={onDragTarget}
          onClick={canSelect ? onSelect : undefined}
        />
      )}
      {canDraw && showHandles && stopY != null && (
        <HandleSquare
          x={x2}
          y={stopY}
          selected={selected}
          cursor="cursor-ns-resize"
          onMouseDown={onDragStop}
          onClick={canSelect ? onSelect : undefined}
        />
      )}

      {/* Entry handle at the box's right edge — horizontal drag resizes the span,
        vertical drag moves the entry price. */}
      {canDraw && showHandles && (
        <HandleSquare
          x={x2}
          y={entryY}
          selected={selected}
          cursor="cursor-move"
          onMouseDown={onDragEntry}
          onClick={canSelect ? onSelect : undefined}
        />
      )}
    </g>
  )
}
