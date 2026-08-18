/** Right edge of the candle pane (left of the price scale), in chart pixels. */
export function plotRightX(
  chartWidth: number,
  priceScaleWidth: number,
  timeScaleWidth = 0
): number {
  if (Number.isFinite(timeScaleWidth) && timeScaleWidth > 0) return timeScaleWidth
  if (!Number.isFinite(chartWidth) || chartWidth <= 0) return 0
  const scale = Number.isFinite(priceScaleWidth) ? Math.max(0, priceScaleWidth) : 0
  return Math.max(0, chartWidth - scale)
}

export function isInPlotX(x: number, plotRight: number): boolean {
  return Number.isFinite(x) && Number.isFinite(plotRight) && x >= 0 && x <= plotRight
}

export function clampXToPlot(x: number, plotRight: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(plotRight) || plotRight <= 0) return 0
  if (x < 0) return 0
  if (x > plotRight) return plotRight
  return x
}

const FIB_MIN_SPAN = 80
const FIB_LABEL_GAP = 6
/** Enough for `0.618 (12345.67)`-style labels. */
const FIB_LABEL_WIDTH = 96

export function fibLevelExtent(
  x1: number,
  x2: number,
  plotRight: number,
  minSpan = FIB_MIN_SPAN
): { left: number; right: number } {
  const rawLeft = Math.min(x1, x2)
  const rawRight = Math.max(x1, x2)
  const desiredRight = rawLeft + Math.max(minSpan, rawRight - rawLeft)
  const maxRight = Number.isFinite(plotRight) && plotRight > 0 ? plotRight : desiredRight
  const left = Math.min(rawLeft, maxRight)
  return { left, right: Math.max(left, Math.min(desiredRight, maxRight)) }
}

export function fibLabelPlacement(
  lineRight: number,
  plotRight: number,
  labelWidth = FIB_LABEL_WIDTH,
  gap = FIB_LABEL_GAP
): { x: number; textAnchor: 'start' | 'end' } {
  if (!Number.isFinite(plotRight) || plotRight <= 0 || lineRight + gap + labelWidth <= plotRight) {
    return { x: lineRight + gap, textAnchor: 'start' }
  }
  return { x: Math.max(0, lineRight - gap), textAnchor: 'end' }
}
