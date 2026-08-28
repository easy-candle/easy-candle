import { alignTimeToInterval } from '@shared/timeframes'

export const DRAW_TOOLS = [
  'select',
  'hline',
  'trendline',
  'fib',
  'fibchannel',
  'rect',
  'long',
  'short'
] as const
export type DrawTool = (typeof DRAW_TOOLS)[number]

/** A drawable tool (excludes the non-drawing Select tool). */
export type DrawingToolType = Exclude<DrawTool, 'select'>

/**
 * Line style values mirroring lightweight-charts `LineStyle` enum
 * (Solid=0, Dotted=1, Dashed=2, LargeDashed=3, SparseDotted=4).
 * Kept dependency-free so this module stays pure geometry.
 */
export type DrawingLineStyle = 0 | 1 | 2 | 3 | 4

/** Per-drawing visual style: line color, stroke width and line style. */
export type DrawingStyle = {
  color: string
  lineWidth: number
  lineStyle: DrawingLineStyle
  /** Rectangle fill; hex or rgba so opacity is part of the selected color. */
  fillColor?: string
  /** Zone fill color for the take-profit area (position tools only). */
  tpColor?: string
  /** Zone fill color for the stop-loss area (position tools only). */
  slColor?: string
}

export type TrendPoint = { time: number; price: number }

export type HLineDrawing = { id: string; type: 'hline'; price: number; style?: DrawingStyle }
export type TrendDrawing = {
  id: string
  type: 'trendline'
  t1: number
  p1: number
  t2: number
  p2: number
  style?: DrawingStyle
}
export type FibDrawing = {
  id: string
  type: 'fib'
  t1: number
  p1: number
  t2: number
  p2: number
  style?: DrawingStyle
  /** Per-level overrides; omitted levels inherit the drawing style. */
  levels?: FibLevelConfig[]
}
export type FibChannelDrawing = {
  id: string
  type: 'fibchannel'
  t1: number
  p1: number
  t2: number
  p2: number
  t3: number
  p3: number
  style?: DrawingStyle
  /** Per-level overrides; omitted levels inherit the drawing style. */
  levels?: FibLevelConfig[]
}
export type RectDrawing = {
  id: string
  type: 'rect'
  t1: number
  p1: number
  t2: number
  p2: number
  style?: DrawingStyle
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
  style?: DrawingStyle
}
export type Drawing =
  | HLineDrawing
  | TrendDrawing
  | FibDrawing
  | FibChannelDrawing
  | RectDrawing
  | PositionDrawing
export type TwoPointDrawing = TrendDrawing | FibDrawing | RectDrawing
export type TwoPointTool = 'trendline' | 'fib' | 'rect'
export type ThreePointTool = 'fibchannel'
export type PositionTool = 'long' | 'short'
export type PositionLevel = 'target' | 'stop'
export type RectHandle = 'nw' | 'ne' | 'sw' | 'se'
export type Endpoint = 'start' | 'end'
export type FibChannelHandle = 'p1' | 'p2' | 'p3'

/** Default position box width in bars. */
export const POSITION_SPAN_DEFAULT = 6
/** Minimum box width in bars. */
export const POSITION_SPAN_MIN = 1
/** Maximum box width in bars. */
export const POSITION_SPAN_MAX = 200
/** Default reward multiple of risk when mirroring a missing level (1:3 R:R). */
export const POSITION_RR_REWARD_MULT = 3
/** Visible-range fraction used as default risk while a TP/SL handle is not armed. */
export const POSITION_DEFAULT_RISK_FRAC = 0.05

export type VisiblePriceRange = { from: number; to: number }

/**
 * Guide TP/SL for a fresh position box: 5% of the visible range as risk,
 * reward at {@link POSITION_RR_REWARD_MULT}. Null when the scale has no span.
 */
export function defaultPositionLevels(
  side: 'long' | 'short',
  entry: number,
  range: VisiblePriceRange | null | undefined
): { target: number; stop: number } | null {
  if (!range || !(range.to > range.from) || !Number.isFinite(entry)) return null
  const risk = (range.to - range.from) * POSITION_DEFAULT_RISK_FRAC
  if (!(risk > 0)) return null
  if (side === 'long') {
    return { target: entry + risk * POSITION_RR_REWARD_MULT, stop: entry - risk }
  }
  return { target: entry - risk * POSITION_RR_REWARD_MULT, stop: entry + risk }
}

/** Stored levels, filling any nulls from the same 1:3 guide the overlay paints. */
export function resolvedPositionLevels(
  drawing: Pick<PositionDrawing, 'type' | 'entry' | 'target' | 'stop'>,
  range: VisiblePriceRange | null | undefined
): { target: number | null; stop: number | null } {
  const defaults = defaultPositionLevels(drawing.type, drawing.entry, range)
  return {
    target: drawing.target ?? defaults?.target ?? null,
    stop: drawing.stop ?? defaults?.stop ?? null
  }
}

/** MetaTrader retracement defaults (no 0.786 / extensions). */
export const FIB_LEVELS: readonly number[] = [0, 0.236, 0.382, 0.5, 0.618, 1]

/** A single Fibonacci level: the ratio plus optional color/line-style overrides. */
export type FibLevelConfig = {
  ratio: number
  /** Overrides the drawing's line color for this level; undefined inherits it. */
  color?: string
  /** Overrides the drawing's line style for this level; undefined inherits it. */
  lineStyle?: DrawingLineStyle
}

/** Default Fibonacci level set (ratios only; every level inherits the drawing style). */
export const DEFAULT_FIB_LEVELS: readonly FibLevelConfig[] = FIB_LEVELS.map((ratio) => ({
  ratio
}))

export function cloneFibLevels(levels: readonly FibLevelConfig[]): FibLevelConfig[] {
  return levels.map((level) => ({ ...level }))
}

/** The level list a fib drawing should render: its own overrides, else the tool defaults. */
export function fibLevelsOf(
  drawing: Pick<FibDrawing, 'levels'>,
  defaults: readonly FibLevelConfig[]
): FibLevelConfig[] {
  const source = drawing.levels ? drawing.levels : defaults
  return [...source].sort((a, b) => a.ratio - b.ratio)
}

export function isDrawTool(value: unknown): value is DrawTool {
  return DRAW_TOOLS.includes(value as DrawTool)
}

export function isTwoPointTool(tool: DrawTool): tool is TwoPointTool {
  return tool === 'trendline' || tool === 'fib' || tool === 'rect'
}

export function isThreePointTool(tool: DrawTool): tool is ThreePointTool {
  return tool === 'fibchannel'
}

export function isPositionTool(tool: DrawTool): tool is PositionTool {
  return tool === 'long' || tool === 'short'
}

export function isPositionDrawing(drawing: Drawing): drawing is PositionDrawing {
  return drawing.type === 'long' || drawing.type === 'short'
}

/** The settings key that backs a drawing's visual defaults. */
export function drawingToolType(drawing: Drawing): DrawingToolType {
  return drawing.type
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

/** Why the place-pending chip cannot submit from a position drawing. */
export type PositionLimitPlacementBlock =
  | 'no-mark'
  | 'at-mark'
  | 'missing-tp'
  | 'missing-sl'
  | 'missing-levels'
  | 'invalid-tp'
  | 'invalid-sl'

/**
 * A fresh long/short drawing may still have null `target`/`stop` while the
 * overlay paints the 1:3 guide. Resolve those guide prices before blocking so
 * Place Limit / Stop Limit uses the box the user already sees.
 */
export function positionLimitPlacementBlock(
  drawing: Pick<PositionDrawing, 'type' | 'entry' | 'target' | 'stop'>,
  opts: {
    hasMark: boolean
    markPrice?: number | null
    visibleRange?: VisiblePriceRange | null
  }
): PositionLimitPlacementBlock | null {
  if (!opts.hasMark) return 'no-mark'
  const mark = opts.markPrice
  if (mark != null && Number.isFinite(mark) && !(drawing.entry < mark) && !(drawing.entry > mark)) {
    return 'at-mark'
  }
  const levels = resolvedPositionLevels(drawing, opts.visibleRange)
  if (levels.target == null && levels.stop == null) return 'missing-levels'
  if (levels.target == null) return 'missing-tp'
  if (levels.stop == null) return 'missing-sl'
  if (!isValidPositionLevel(drawing.type, 'target', drawing.entry, levels.target)) {
    return 'invalid-tp'
  }
  if (!isValidPositionLevel(drawing.type, 'stop', drawing.entry, levels.stop)) {
    return 'invalid-sl'
  }
  return null
}

export function positionPendingChipLabel(
  side: 'long' | 'short',
  kind: 'limit' | 'stopLimit' | null | undefined
): string {
  if (side === 'long') {
    return kind === 'stopLimit' ? 'Place Buy Stop Limit' : 'Place Buy Limit'
  }
  return kind === 'stopLimit' ? 'Place Sell Stop Limit' : 'Place Sell Limit'
}

export function positionLimitPlacementHint(
  block: PositionLimitPlacementBlock | null,
  side: 'long' | 'short',
  kind?: 'limit' | 'stopLimit' | null
): string {
  switch (block) {
    case 'no-mark':
      return 'Cannot place a pending order — no current price'
    case 'at-mark':
      return 'Cannot place a pending order — entry is at the current price. Move the box above or below market'
    case 'missing-levels':
      return 'Take profit and stop loss are not set — drag the TP and SL handles first'
    case 'missing-tp':
      return 'Take profit is not set — drag the TP handle first'
    case 'missing-sl':
      return 'Stop loss is not set — drag the SL handle first'
    case 'invalid-tp':
      return 'Drawn take profit is not valid for this entry'
    case 'invalid-sl':
      return 'Drawn stop loss is not valid for this entry'
    default:
      if (kind === 'stopLimit') {
        return side === 'long'
          ? 'Place a Buy Stop Limit at the drawing entry with its drawn TP/SL'
          : 'Place a Sell Stop Limit at the drawing entry with its drawn TP/SL'
      }
      return side === 'long'
        ? 'Place a Buy Limit at the drawing entry with its drawn TP/SL'
        : 'Place a Sell Limit at the drawing entry with its drawn TP/SL'
  }
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

/** Parallel segment at `ratio` between the base (P1–P2, ratio 0) and the width line through P3 (ratio 1). */
export function fibChannelSegment(
  p1: TrendPoint,
  p2: TrendPoint,
  p3: TrendPoint,
  ratio: number
): { a: TrendPoint; b: TrendPoint } {
  const dt = p3.time - p1.time
  const dp = p3.price - p1.price
  return {
    a: { time: p1.time + dt * ratio, price: p1.price + dp * ratio },
    b: { time: p2.time + dt * ratio, price: p2.price + dp * ratio }
  }
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
  if (drawing.type === 'fibchannel') {
    return {
      ...drawing,
      t1: drawing.t1 + dTime,
      p1: drawing.p1 + dPrice,
      t2: drawing.t2 + dTime,
      p2: drawing.p2 + dPrice,
      t3: drawing.t3 + dTime,
      p3: drawing.p3 + dPrice
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
  if (drawing.type === 'fibchannel') {
    return {
      ...drawing,
      t1: alignTimeToInterval(drawing.t1, intervalSec),
      t2: alignTimeToInterval(drawing.t2, intervalSec),
      t3: alignTimeToInterval(drawing.t3, intervalSec)
    }
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

export function updateFibChannelHandle(
  drawing: FibChannelDrawing,
  handle: FibChannelHandle,
  point: TrendPoint
): FibChannelDrawing {
  if (handle === 'p1') return { ...drawing, t1: point.time, p1: point.price }
  if (handle === 'p2') return { ...drawing, t2: point.time, p2: point.price }
  return { ...drawing, t3: point.time, p3: point.price }
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
