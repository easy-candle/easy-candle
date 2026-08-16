import { alignTimeToInterval } from '@shared/timeframes'

export const DRAW_TOOLS = ['select', 'hline', 'trendline', 'fib', 'rect'] as const
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
export type Drawing = HLineDrawing | TrendDrawing | FibDrawing | RectDrawing
export type TwoPointDrawing = TrendDrawing | FibDrawing | RectDrawing
export type TwoPointTool = 'trendline' | 'fib' | 'rect'
export type RectHandle = 'nw' | 'ne' | 'sw' | 'se'
export type Endpoint = 'start' | 'end'

/** MetaTrader retracement defaults (no 0.786 / extensions). */
export const FIB_LEVELS: readonly number[] = [0, 0.236, 0.382, 0.5, 0.618, 1]

export function isDrawTool(value: unknown): value is DrawTool {
  return DRAW_TOOLS.includes(value as DrawTool)
}

export function isTwoPointTool(tool: DrawTool): tool is TwoPointTool {
  return tool === 'trendline' || tool === 'fib' || tool === 'rect'
}

export function fibPriceAtLevel(p1: number, p2: number, ratio: number): number {
  return p1 + (p2 - p1) * ratio
}

export function formatFibLevel(ratio: number): string {
  if (ratio === 0 || ratio === 1) return ratio.toFixed(1)
  if (ratio === 0.5) return '0.5'
  return String(ratio)
}

export function cloneDrawing(drawing: Drawing, newId: string): Drawing {
  return { ...drawing, id: newId }
}

export function translateDrawing(drawing: Drawing, dTime: number, dPrice: number): Drawing {
  if (drawing.type === 'hline') {
    return { ...drawing, price: drawing.price + dPrice }
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
  if (drawing.type === 'hline') return drawing
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
