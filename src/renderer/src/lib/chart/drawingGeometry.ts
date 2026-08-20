import { alignTimeToInterval } from '@shared/timeframes'

export const DRAW_TOOLS = ['select', 'hline', 'trendline', 'fib', 'rect', 'long', 'short'] as const
export type DrawTool = (typeof DRAW_TOOLS)[number]

export type TrendPoint = { time: number; price: number }

export type HLineDrawing = { id: string; type: 'hline'; price: number }
export type TrendDrawing = {
  id: string
  type: 'trendline'
  t1: number
  p1: number
  t2: number
  p2: number
}
export type FibDrawing = {
  id: string
  type: 'fib'
  t1: number
  p1: number
  t2: number
  p2: number
}
export type RectDrawing = {
  id: string
  type: 'rect'
  t1: number
  p1: number
  t2: number
  p2: number
}
export type PositionDrawing = {
  id: string
  type: 'long' | 'short'
  t: number
  entry: number
  target: number | null
  stop: number | null
  /** Box width in bars to the right of the entry time. */
  span: number
}
export type Drawing =
  | HLineDrawing
  | TrendDrawing
  | FibDrawing
  | RectDrawing
  | PositionDrawing
export type TwoPointDrawing = TrendDrawing | FibDrawing | RectDrawing
export type TwoPointTool = 'trendline' | 'fib' | 'rect'
export type PositionTool = 'long' | 'short'
export type PositionLevel = 'target' | 'stop'
export type RectHandle = 'nw' | 'ne' | 'sw' | 'se'
export type Endpoint = 'start' | 'end'

/** Default position box width in bars. */
export const POSITION_SPAN_DEFAULT = 6
/** Minimum box width in bars. */
export const POSITION_SPAN_MIN = 1
/** Maximum box width in bars. */
export const POSITION_SPAN_MAX = 200
/** Default reward multiple of risk when mirroring a missing level (1:3 R:R). */
export const POSITION_RR_REWARD_MULT = 3

/** MetaTrader retracement defaults (no 0.786 / extensions). */
export const FIB_LEVELS: readonly number[] = [0, 0.236, 0.382, 0.5, 0.618, 1]

export function isDrawTool(value: unknown): value is DrawTool {
  return DRAW_TOOLS.includes(value as DrawTool)
}

export function isTwoPointTool(tool: DrawTool): tool is TwoPointTool {
  return tool === 'trendline' || tool === 'fib' || tool === 'rect'
}

export function isPositionTool(tool: DrawTool): tool is PositionTool {
  return tool === 'long' || tool === 'short'
}

export function isPositionDrawing(drawing: Drawing): drawing is PositionDrawing {
  return drawing.type === 'long' || drawing.type === 'short'
}

/** A level is valid when it sits in its profit/loss direction from entry. */
export function isValidPositionLevel(
  side: 'long' | 'short',
  level: PositionLevel,
  entry: number,
  price: number
): boolean {
  if (level === 'target') return side === 'long' ? price > entry : price < entry
  return side === 'long' ? price < entry : price > entry
}

/** Mirror the missing opposite level at the default 1:3 R:R guide. */
export function mirrorPositionLevel(
  side: 'long' | 'short',
  entry: number,
  level: PositionLevel,
  price: number
): number {
  const delta = Math.abs(price - entry)
  if (level === 'target') {
    // The dragged target sets the reward; the mirrored stop sits at a third of the distance (1:3 R:R).
    const third = delta / POSITION_RR_REWARD_MULT
    return side === 'long' ? entry - third : entry + third
  }
  // The dragged stop sets the risk; the mirrored target sits at triple the distance (1:3 R:R).
  const tripled = delta * POSITION_RR_REWARD_MULT
  return side === 'long' ? entry + tripled : entry - tripled
}

export function fibPriceAtLevel(p1: number, p2: number, ratio: number): number {
  return p1 + (p2 - p1) * ratio
}

export function formatFibLevel(ratio: number): string {
  if (ratio === 0 || ratio === 1) return ratio.toFixed(1)
  if (ratio === 0.5) return '0.5'
  return String(ratio)
}

/** Signed percent from entry to a TP/SL, from the position's P&L side. */
export function formatPriceChangePct(entry: number, price: number, side: 'long' | 'short'): string {
  if (!Number.isFinite(entry) || !Number.isFinite(price) || entry === 0) return '0.00%'
  const delta = ((price - entry) / Math.abs(entry)) * 100
  const pct = side === 'short' ? -delta : delta
  const rounded = Math.round(pct * 100) / 100
  if (rounded === 0) return '0.00%'
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(2)}%`
}

export function cloneDrawing(drawing: Drawing, newId: string): Drawing {
  return { ...drawing, id: newId }
}

export function translateDrawing(drawing: Drawing, dTime: number, dPrice: number): Drawing {
  if (drawing.type === 'hline') {
    return { ...drawing, price: drawing.price + dPrice }
  }
  if (isPositionDrawing(drawing)) {
    return {
      ...drawing,
      t: drawing.t + dTime,
      entry: drawing.entry + dPrice,
      target: drawing.target == null ? null : drawing.target + dPrice,
      stop: drawing.stop == null ? null : drawing.stop + dPrice
    }
  }
  return {
    ...drawing,
    t1: drawing.t1 + dTime,
    p1: drawing.p1 + dPrice,
    t2: drawing.t2 + dTime,
    p2: drawing.p2 + dPrice
  }
}

export function remapDrawingTimes(drawing: Drawing, intervalSec: number): Drawing {
  if (drawing.type === 'hline' || isPositionDrawing(drawing)) {
    return isPositionDrawing(drawing)
      ? { ...drawing, t: alignTimeToInterval(drawing.t, intervalSec) }
      : drawing
  }
  return {
    ...drawing,
    t1: alignTimeToInterval(drawing.t1, intervalSec),
    t2: alignTimeToInterval(drawing.t2, intervalSec)
  }
}

export function updateTwoPointEndpoint<T extends TrendDrawing | FibDrawing>(
  drawing: T,
  end: Endpoint,
  point: TrendPoint
): T {
  return end === 'start'
    ? { ...drawing, t1: point.time, p1: point.price }
    : { ...drawing, t2: point.time, p2: point.price }
}

export function updateRectHandle(
  drawing: RectDrawing,
  handle: RectHandle,
  point: TrendPoint
): RectDrawing {
  let left = Math.min(drawing.t1, drawing.t2)
  let right = Math.max(drawing.t1, drawing.t2)
  let top = Math.max(drawing.p1, drawing.p2)
  let bottom = Math.min(drawing.p1, drawing.p2)

  if (handle === 'nw' || handle === 'sw') left = point.time
  if (handle === 'ne' || handle === 'se') right = point.time
  if (handle === 'nw' || handle === 'ne') top = point.price
  if (handle === 'sw' || handle === 'se') bottom = point.price

  return { ...drawing, t1: left, t2: right, p1: top, p2: bottom }
}
