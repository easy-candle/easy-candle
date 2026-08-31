import type { BarData, LineData, Time } from 'lightweight-charts'

export type LegendBar = BarData<Time> | LineData<Time>

export function isLineData(bar: LegendBar): bar is LineData<Time> {
  return 'value' in bar
}

function timeEq(a: Time, b: Time): boolean {
  if (a === b) return true
  if (typeof a === 'object' && typeof b === 'object' && a != null && b != null) {
    return a.year === b.year && a.month === b.month && a.day === b.day
  }
  return false
}

/** True when two legend bars show the same time and OHLC / line value. */
export function sameBar(a: LegendBar | null, b: LegendBar | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (!timeEq(a.time, b.time)) return false
  const aLine = isLineData(a)
  const bLine = isLineData(b)
  if (aLine !== bLine) return false
  if (aLine && bLine) return a.value === b.value
  if (!aLine && !bLine) {
    return a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close
  }
  return false
}
