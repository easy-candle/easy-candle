import type { Candle } from '@shared/candleUtils'
import { atrSeries } from './atr'
import { DEFAULT_SMC_SETTINGS } from './settings'
import type {
  SmcBias,
  SmcBox,
  SmcLabel,
  SmcLayer,
  SmcScene,
  SmcSegment,
  SmcSettings,
  SmcTag
} from './types'

type TrailingExtremes = {
  top: number | null
  bottom: number | null
  lastTopTime: number
  lastBottomTime: number
}

const BULLISH = 1
const BEARISH = -1
/** LuxAlgo `BEARISH_LEG` / `BULLISH_LEG` — not the same as structure bias. */
const BEARISH_LEG = 0
const BULLISH_LEG = 1

type Pivot = {
  level: number | null
  crossed: boolean
  barIndex: number
  barTime: number
}

type OrderBlock = {
  high: number
  low: number
  time: number
  bias: number
  layer: SmcLayer
}

type FairValueGap = {
  top: number
  bottom: number
  bias: number
  leftTime: number
  rightTime: number
}

type StructureHit = {
  pivotTime: number
  pivotPrice: number
  breakTime: number
  tag: SmcTag
  bias: SmcBias
  layer: SmcLayer
}

function emptyPivot(): Pivot {
  return { level: null, crossed: false, barIndex: -1, barTime: 0 }
}

function emptyTrailing(): TrailingExtremes {
  return { top: null, bottom: null, lastTopTime: 0, lastBottomTime: 0 }
}

/** LuxAlgo `updateTrailingExtremes`: running max high / min low after the last swing pivot. */
function updateTrailingExtremes(bar: Candle, trailing: TrailingExtremes): void {
  if (trailing.top != null && bar.high >= trailing.top) {
    trailing.top = bar.high
    trailing.lastTopTime = bar.time
  }
  if (trailing.bottom != null && bar.low <= trailing.bottom) {
    trailing.bottom = bar.low
    trailing.lastBottomTime = bar.time
  }
}

function pushCapped<T>(list: T[], item: T, cap: number): void {
  list.push(item)
  if (list.length > cap) list.shift()
}

function unshiftCapped<T>(list: T[], item: T, cap: number): void {
  list.unshift(item)
  if (list.length > cap) list.pop()
}

function clampPivot(value: number, fallback: number): number {
  const size = Math.floor(Number(value) || fallback)
  return Math.max(1, size)
}

function clampCount(value: number, fallback: number): number {
  const size = Math.floor(Number(value))
  if (!Number.isFinite(size)) return Math.max(0, fallback)
  return Math.max(0, size)
}

/**
 * LuxAlgo `high[size] > ta.highest(size)`: bar `pivotIdx` is a candidate
 * bearish-leg high once `size` later bars have all printed a lower high.
 */
function isPivotHigh(candles: Candle[], pivotIdx: number, size: number): boolean {
  const pivot = candles[pivotIdx]
  if (!pivot) return false
  const end = pivotIdx + size
  if (end >= candles.length) return false
  for (let i = pivotIdx + 1; i <= end; i += 1) {
    const bar = candles[i]
    if (!bar || !(pivot.high > bar.high)) return false
  }
  return true
}

function isPivotLow(candles: Candle[], pivotIdx: number, size: number): boolean {
  const pivot = candles[pivotIdx]
  if (!pivot) return false
  const end = pivotIdx + size
  if (end >= candles.length) return false
  for (let i = pivotIdx + 1; i <= end; i += 1) {
    const bar = candles[i]
    if (!bar || !(pivot.low < bar.low)) return false
  }
  return true
}

function crossedUp(candles: Candle[], index: number, level: number): boolean {
  const current = candles[index]
  const previous = candles[index - 1]
  if (!current) return false
  if (index === 0) return current.close > level
  return current.close > level && (previous?.close ?? level) <= level
}

function crossedDown(candles: Candle[], index: number, level: number): boolean {
  const current = candles[index]
  const previous = candles[index - 1]
  if (!current) return false
  if (index === 0) return current.close < level
  return current.close < level && (previous?.close ?? level) >= level
}

function extremeIndex(
  values: number[],
  from: number,
  toExclusive: number,
  kind: 'min' | 'max'
): number | null {
  if (toExclusive <= from) return null
  let best = from
  let value = values[from]
  if (value == null || !Number.isFinite(value)) return null
  for (let i = from + 1; i < toExclusive; i += 1) {
    const next = values[i]
    if (next == null || !Number.isFinite(next)) continue
    if (kind === 'min' ? next < value : next > value) {
      value = next
      best = i
    }
  }
  return best
}

/**
 * LuxAlgo OB filter: a bar whose range is >= 2*ATR has its high/low swapped
 * in the parsed series so it cannot win min-low / max-high selection.
 */
function parsedExtremes(
  candles: Candle[],
  atr: Array<number | null>,
  filterMult: number
): { highs: number[]; lows: number[] } {
  const highs: number[] = []
  const lows: number[] = []
  const mult = Number.isFinite(filterMult) ? filterMult : 2
  for (let i = 0; i < candles.length; i += 1) {
    const bar = candles[i]
    const measure = atr[i]
    const range = bar ? bar.high - bar.low : 0
    const volatile = measure != null && Number.isFinite(measure) && range >= mult * measure
    highs.push(bar ? (volatile ? bar.low : bar.high) : 0)
    lows.push(bar ? (volatile ? bar.high : bar.low) : 0)
  }
  return { highs, lows }
}

function biasOf(value: number): SmcBias {
  return value === BEARISH ? 'bear' : 'bull'
}

/**
 * Smart Money Concepts overlay for the given candle window.
 *
 * Swing points follow LuxAlgo `leg()`: highs and lows must alternate, using
 * the same `size`-bar confirmation as `high[size] > ta.highest(size)`.
 * Trailing Strong/Weak high/low levels reset only on those alternating
 * swing pivots, then track the running max high / min low.
 *
 * Order blocks follow LuxAlgo: ATR-parsed extremes, wick mitigation, and
 * only the newest internal OBs (default 5) are drawn — not every zone from
 * the start of the loaded series.
 */
export function computeSmc(
  candles: Candle[],
  settings: SmcSettings = DEFAULT_SMC_SETTINGS
): SmcScene {
  const scene: SmcScene = { segments: [], boxes: [], labels: [] }
  if (!Array.isArray(candles) || candles.length < 3) return scene

  const cap = Math.max(1, Math.floor(Number(settings.maxPrimitives) || DEFAULT_SMC_SETTINGS.maxPrimitives))
  const internalSize = clampPivot(settings.internalPivotSize, DEFAULT_SMC_SETTINGS.internalPivotSize)
  const swingSize = clampPivot(settings.swingPivotSize, DEFAULT_SMC_SETTINGS.swingPivotSize)
  const atrPeriod = clampPivot(settings.atrPeriod, DEFAULT_SMC_SETTINGS.atrPeriod)
  const obFilterMult =
    Number.isFinite(settings.obFilterMult) && settings.obFilterMult > 0
      ? settings.obFilterMult
      : DEFAULT_SMC_SETTINGS.obFilterMult
  const internalObCount = clampCount(
    settings.internalOrderBlockCount,
    DEFAULT_SMC_SETTINGS.internalOrderBlockCount
  )
  const swingObCount = clampCount(
    settings.swingOrderBlockCount,
    DEFAULT_SMC_SETTINGS.swingOrderBlockCount
  )
  const bullColor = settings.bullColor || DEFAULT_SMC_SETTINGS.bullColor
  const bearColor = settings.bearColor || DEFAULT_SMC_SETTINGS.bearColor

  const parsed = parsedExtremes(candles, atrSeries(candles, atrPeriod), obFilterMult)

  const swingHigh = emptyPivot()
  const swingLow = emptyPivot()
  const internalHigh = emptyPivot()
  const internalLow = emptyPivot()
  const trailing = emptyTrailing()
  let swingLeg = BEARISH_LEG
  let internalLeg = BEARISH_LEG
  let swingBias = 0
  let internalBias = 0
  const showHighLowSwings = settings.showHighLowSwings !== false

  const hits: StructureHit[] = []
  const internalOrderBlocks: OrderBlock[] = []
  const swingOrderBlocks: OrderBlock[] = []
  const gaps: FairValueGap[] = []

  /**
   * LuxAlgo `getCurrentStructure` / `leg()`: a new swing point is stored only
   * when the leg *changes*. Consecutive local highs (or lows) do not replace
   * the current swing, so trailing Strong/Weak levels stay on the last
   * alternating pivot instead of walking forward through the trend.
   */
  function confirmPivots(
    index: number,
    size: number,
    high: Pivot,
    low: Pivot,
    layer: 'swing' | 'internal'
  ): void {
    const pivotIdx = index - size
    if (pivotIdx < 0) return
    const bar = candles[pivotIdx]
    if (!bar) return

    const newLegHigh = isPivotHigh(candles, pivotIdx, size)
    const newLegLow = isPivotLow(candles, pivotIdx, size)
    const prevLeg = layer === 'swing' ? swingLeg : internalLeg
    let nextLeg = prevLeg
    if (newLegHigh) nextLeg = BEARISH_LEG
    else if (newLegLow) nextLeg = BULLISH_LEG
    if (layer === 'swing') swingLeg = nextLeg
    else internalLeg = nextLeg
    if (nextLeg === prevLeg) return

    const trackTrailing = layer === 'swing' && showHighLowSwings
    if (nextLeg === BULLISH_LEG) {
      low.level = bar.low
      low.crossed = false
      low.barIndex = pivotIdx
      low.barTime = bar.time
      if (trackTrailing) {
        trailing.bottom = bar.low
        trailing.lastBottomTime = bar.time
      }
    } else {
      high.level = bar.high
      high.crossed = false
      high.barIndex = pivotIdx
      high.barTime = bar.time
      if (trackTrailing) {
        trailing.top = bar.high
        trailing.lastTopTime = bar.time
      }
    }
  }

  function storeOrderBlock(pivot: Pivot, breakIndex: number, bias: number, layer: SmcLayer): void {
    const count = layer === 'internal' ? internalObCount : swingObCount
    if (count <= 0 || pivot.barIndex < 0) return
    const kind = bias === BULLISH ? 'min' : 'max'
    const values = bias === BULLISH ? parsed.lows : parsed.highs
    const obIndex = extremeIndex(values, pivot.barIndex, breakIndex, kind)
    if (obIndex == null) return
    const list = layer === 'internal' ? internalOrderBlocks : swingOrderBlocks
    unshiftCapped(
      list,
      {
        high: parsed.highs[obIndex] ?? 0,
        low: parsed.lows[obIndex] ?? 0,
        time: candles[obIndex]?.time ?? 0,
        bias,
        layer
      },
      cap
    )
  }

  function tryBreak(
    index: number,
    high: Pivot,
    low: Pivot,
    layer: SmcLayer,
    skipHighLevel: number | null,
    skipLowLevel: number | null
  ): void {
    const bar = candles[index]
    if (!bar) return
    const isInternal = layer === 'internal'

    if (
      high.level != null &&
      !high.crossed &&
      high.level !== skipHighLevel &&
      crossedUp(candles, index, high.level)
    ) {
      const tag: SmcTag = (isInternal ? internalBias : swingBias) === BEARISH ? 'CHoCH' : 'BOS'
      high.crossed = true
      if (isInternal) internalBias = BULLISH
      else swingBias = BULLISH
      pushCapped(
        hits,
        {
          pivotTime: high.barTime,
          pivotPrice: high.level,
          breakTime: bar.time,
          tag,
          bias: 'bull',
          layer
        },
        cap
      )
      storeOrderBlock(high, index, BULLISH, layer)
    }

    if (
      low.level != null &&
      !low.crossed &&
      low.level !== skipLowLevel &&
      crossedDown(candles, index, low.level)
    ) {
      const tag: SmcTag = (isInternal ? internalBias : swingBias) === BULLISH ? 'CHoCH' : 'BOS'
      low.crossed = true
      if (isInternal) internalBias = BEARISH
      else swingBias = BEARISH
      pushCapped(
        hits,
        {
          pivotTime: low.barTime,
          pivotPrice: low.level,
          breakTime: bar.time,
          tag,
          bias: 'bear',
          layer
        },
        cap
      )
      storeOrderBlock(low, index, BEARISH, layer)
    }
  }

  function mitigateOrderBlocks(bar: Candle): void {
    // LuxAlgo default mitigation is High/Low: a wick through the zone removes it.
    const lists = [internalOrderBlocks, swingOrderBlocks]
    for (const list of lists) {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const block = list[i]
        if (!block) continue
        const filled =
          (block.bias === BEARISH && bar.high > block.high) ||
          (block.bias === BULLISH && bar.low < block.low)
        if (filled) list.splice(i, 1)
      }
    }
  }

  function updateFairValueGaps(index: number, bar: Candle): void {
    for (let i = gaps.length - 1; i >= 0; i -= 1) {
      const gap = gaps[i]
      if (!gap) continue
      const filled =
        (gap.bias === BULLISH && bar.low < gap.bottom) ||
        (gap.bias === BEARISH && bar.high > gap.top)
      if (filled) gaps.splice(i, 1)
    }

    if (index < 2) return
    const left = candles[index - 2]
    const mid = candles[index - 1]
    if (!left || !mid) return

    if (bar.low > left.high && mid.close > left.high) {
      pushCapped(
        gaps,
        { top: bar.low, bottom: left.high, bias: BULLISH, leftTime: left.time, rightTime: bar.time },
        cap
      )
    } else if (bar.high < left.low && mid.close < left.low) {
      pushCapped(
        gaps,
        { top: left.low, bottom: bar.high, bias: BEARISH, leftTime: left.time, rightTime: bar.time },
        cap
      )
    }
  }

  for (let i = 0; i < candles.length; i += 1) {
    const bar = candles[i]
    if (!bar) continue
    if (showHighLowSwings) updateTrailingExtremes(bar, trailing)
    confirmPivots(i, swingSize, swingHigh, swingLow, 'swing')
    confirmPivots(i, internalSize, internalHigh, internalLow, 'internal')
    tryBreak(i, swingHigh, swingLow, 'swing', null, null)
    tryBreak(i, internalHigh, internalLow, 'internal', swingHigh.level, swingLow.level)
    mitigateOrderBlocks(bar)
    updateFairValueGaps(i, bar)
  }

  return sceneFromState(
    hits,
    internalOrderBlocks.slice(0, internalObCount),
    swingOrderBlocks.slice(0, swingObCount),
    gaps,
    candles[candles.length - 1]?.time ?? 0,
    {
      bullColor,
      bearColor,
      bullObFill: settings.bullObFill || DEFAULT_SMC_SETTINGS.bullObFill,
      bearObFill: settings.bearObFill || DEFAULT_SMC_SETTINGS.bearObFill,
      bullFvgFill: settings.bullFvgFill || DEFAULT_SMC_SETTINGS.bullFvgFill,
      bearFvgFill: settings.bearFvgFill || DEFAULT_SMC_SETTINGS.bearFvgFill,
      bullFvgBorder: settings.bullFvgBorder || DEFAULT_SMC_SETTINGS.bullFvgBorder,
      bearFvgBorder: settings.bearFvgBorder || DEFAULT_SMC_SETTINGS.bearFvgBorder
    },
    cap,
    showHighLowSwings ? trailing : emptyTrailing(),
    swingBias
  )
}

type Palette = Pick<
  SmcSettings,
  | 'bullColor'
  | 'bearColor'
  | 'bullObFill'
  | 'bearObFill'
  | 'bullFvgFill'
  | 'bearFvgFill'
  | 'bullFvgBorder'
  | 'bearFvgBorder'
>

function sceneFromState(
  hits: StructureHit[],
  internalOrderBlocks: OrderBlock[],
  swingOrderBlocks: OrderBlock[],
  gaps: FairValueGap[],
  lastTime: number,
  palette: Palette,
  cap: number,
  trailing: TrailingExtremes,
  swingBias: number
): SmcScene {
  const scene: SmcScene = { segments: [], boxes: [], labels: [] }

  for (const hit of hits) {
    const color = hit.bias === 'bull' ? palette.bullColor : palette.bearColor
    const segment: SmcSegment = {
      kind: 'segment',
      t1: hit.pivotTime,
      p1: hit.pivotPrice,
      t2: hit.breakTime,
      p2: hit.pivotPrice,
      color,
      style: hit.layer === 'internal' ? 'dashed' : 'solid',
      tag: hit.tag,
      layer: hit.layer,
      bias: hit.bias
    }
    pushCapped(scene.segments, segment, cap)
    const label: SmcLabel = {
      kind: 'label',
      t: Math.round((hit.pivotTime + hit.breakTime) / 2),
      price: hit.pivotPrice,
      text: hit.tag,
      color,
      align: hit.bias === 'bull' ? 'down' : 'up'
    }
    pushCapped(scene.labels, label, cap)
  }

  for (const block of [...internalOrderBlocks, ...swingOrderBlocks]) {
    const bull = block.bias === BULLISH
    const box: SmcBox = {
      kind: 'box',
      t1: block.time,
      p1: block.high,
      t2: lastTime,
      p2: block.low,
      fill: bull ? palette.bullObFill : palette.bearObFill,
      extendRight: true,
      tag: 'ob',
      bias: biasOf(block.bias)
    }
    pushCapped(scene.boxes, box, cap)
  }

  for (const gap of gaps) {
    const bull = gap.bias === BULLISH
    const box: SmcBox = {
      kind: 'box',
      t1: gap.leftTime,
      p1: gap.top,
      t2: gap.rightTime,
      p2: gap.bottom,
      fill: bull ? palette.bullFvgFill : palette.bearFvgFill,
      border: bull ? palette.bullFvgBorder : palette.bearFvgBorder,
      extendRight: false,
      fromBarRight: true,
      midline: true,
      tag: 'fvg',
      bias: biasOf(gap.bias)
    }
    pushCapped(scene.boxes, box, cap)
  }

  appendHighLowSwings(scene, trailing, swingBias, lastTime, palette)

  return scene
}

/** LuxAlgo `drawHighLowSwings`: most recent trailing swing high/low, tagged by swing bias. */
function appendHighLowSwings(
  scene: SmcScene,
  trailing: TrailingExtremes,
  swingBias: number,
  lastTime: number,
  palette: Palette
): void {
  if (trailing.top != null) {
    const tag: SmcTag = swingBias === BEARISH ? 'Strong High' : 'Weak High'
    scene.segments.push({
      kind: 'segment',
      t1: trailing.lastTopTime,
      p1: trailing.top,
      t2: lastTime,
      p2: trailing.top,
      color: palette.bearColor,
      style: 'solid',
      tag,
      layer: 'swing',
      bias: 'bear',
      extendRight: true
    })
    scene.labels.push({
      kind: 'label',
      t: lastTime,
      price: trailing.top,
      text: tag,
      color: palette.bearColor,
      align: 'down',
      atRight: true
    })
  }

  if (trailing.bottom != null) {
    const tag: SmcTag = swingBias === BULLISH ? 'Strong Low' : 'Weak Low'
    scene.segments.push({
      kind: 'segment',
      t1: trailing.lastBottomTime,
      p1: trailing.bottom,
      t2: lastTime,
      p2: trailing.bottom,
      color: palette.bullColor,
      style: 'solid',
      tag,
      layer: 'swing',
      bias: 'bull',
      extendRight: true
    })
    scene.labels.push({
      kind: 'label',
      t: lastTime,
      price: trailing.bottom,
      text: tag,
      color: palette.bullColor,
      align: 'up',
      atRight: true
    })
  }
}
