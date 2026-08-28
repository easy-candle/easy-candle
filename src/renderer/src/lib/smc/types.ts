export type SmcLayer = 'internal' | 'swing'
export type SmcBias = 'bull' | 'bear'
export type SmcTag = 'BOS' | 'CHoCH'
export type SmcBoxTag = 'ob' | 'fvg'
export type SmcLineStyle = 'solid' | 'dashed'
export type SmcLabelAlign = 'up' | 'down'

export type SmcSegment = {
  kind: 'segment'
  t1: number
  p1: number
  t2: number
  p2: number
  color: string
  style: SmcLineStyle
  tag: SmcTag
  layer: SmcLayer
  bias: SmcBias
}

export type SmcBox = {
  kind: 'box'
  t1: number
  p1: number
  t2: number
  p2: number
  fill: string
  border?: string
  extendRight?: boolean
  /** Left edge is the right side of the t1 candle (TradingView FVG). */
  fromBarRight?: boolean
  /** Horizontal line at the midpoint of the box (FVG CE). */
  midline?: boolean
  tag: SmcBoxTag
  bias: SmcBias
}

export type SmcLabel = {
  kind: 'label'
  t: number
  price: number
  text: string
  color: string
  align: SmcLabelAlign
}

export type SmcScene = {
  segments: SmcSegment[]
  boxes: SmcBox[]
  labels: SmcLabel[]
}

export type SmcSettings = {
  /** Confirming bars after an internal pivot (LuxAlgo internal structure). */
  internalPivotSize: number
  /** Confirming bars after a swing pivot (LuxAlgo `swingsLengthInput`). */
  swingPivotSize: number
  /** Safety cap per primitive list; newest entries are kept. */
  maxPrimitives: number
  /** Wilder ATR length used to filter volatile OB candles (LuxAlgo `ta.atr(200)`). */
  atrPeriod: number
  /** A bar is volatile when its range is >= this many ATRs (LuxAlgo uses 2). */
  obFilterMult: number
  /** How many unmitigated internal OBs to draw (LuxAlgo default 5). */
  internalOrderBlockCount: number
  /** How many unmitigated swing OBs to draw (LuxAlgo default 0 / off). */
  swingOrderBlockCount: number
  bullColor: string
  bearColor: string
  bullObFill: string
  bearObFill: string
  bullFvgFill: string
  bearFvgFill: string
  bullFvgBorder: string
  bearFvgBorder: string
}
