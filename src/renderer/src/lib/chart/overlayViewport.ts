import type { IChartApi } from 'lightweight-charts'

export type OverlayViewportSnapshot = {
  width: number
  height: number
  timeFrom: number | null
  timeTo: number | null
  priceFrom: number | null
  priceTo: number | null
}

export function readOverlayViewport(chart: IChartApi): OverlayViewportSnapshot {
  const el = chart.chartElement()
  const logical = chart.timeScale().getVisibleLogicalRange()
  const price = chart.priceScale('right').getVisibleRange()
  return {
    width: el?.clientWidth ?? 0,
    height: el?.clientHeight ?? 0,
    timeFrom: logical?.from ?? null,
    timeTo: logical?.to ?? null,
    priceFrom: price?.from ?? null,
    priceTo: price?.to ?? null
  }
}

/** Crosshair-only paints keep plot size and visible ranges unchanged. */
export function sameOverlayViewport(
  prev: OverlayViewportSnapshot | null,
  next: OverlayViewportSnapshot
): boolean {
  if (!prev) return false
  return (
    prev.width === next.width &&
    prev.height === next.height &&
    prev.timeFrom === next.timeFrom &&
    prev.timeTo === next.timeTo &&
    prev.priceFrom === next.priceFrom &&
    prev.priceTo === next.priceTo
  )
}
