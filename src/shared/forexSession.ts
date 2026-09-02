/** US DST in UTC: 2nd Sunday of March 07:00 → 1st Sunday of November 06:00. */
const DST_START_UTC_HOUR = 7
const DST_END_UTC_HOUR = 6
const HOUR = 3600

const EDT_OFFSET_SECONDS = 21 * HOUR
const EST_OFFSET_SECONDS = 22 * HOUR

export const FOREX_SESSION_TIMEFRAMES = ['4h', '1d'] as const

function nthUtcSunday(year: number, monthIndex: number, n: number): number {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()
  const firstSundayDate = firstWeekday === 0 ? 1 : 8 - firstWeekday
  const date = firstSundayDate + (n - 1) * 7
  return Date.UTC(year, monthIndex, date) / 1000
}

function isUsDst(timeSeconds: number): boolean {
  const year = new Date(timeSeconds * 1000).getUTCFullYear()
  const dstStart = nthUtcSunday(year, 2, 2) + DST_START_UTC_HOUR * HOUR
  const dstEnd = nthUtcSunday(year, 10, 1) + DST_END_UTC_HOUR * HOUR
  return timeSeconds >= dstStart && timeSeconds < dstEnd
}

/** Seconds after UTC midnight for the NY 17:00 forex close at `timeSeconds`. */
export function forexNyCloseOffsetSeconds(timeSeconds: number): number {
  return isUsDst(timeSeconds) ? EDT_OFFSET_SECONDS : EST_OFFSET_SECONDS
}

/**
 * Floor `timeSeconds` onto an interval grid shifted by `offsetSeconds`.
 * Offset `0` equals `Math.floor(t / step) * step`.
 */
export function floorToInterval(
  timeSeconds: number,
  intervalSeconds: number,
  offsetSeconds = 0
): number {
  const t = Math.floor(Number(timeSeconds))
  const step = Math.max(1, Math.floor(Number(intervalSeconds)) || 1)
  const off = Math.floor(Number(offsetSeconds)) || 0
  if (!Number.isFinite(t)) return 0
  return Math.floor((t - off) / step) * step + off
}

/** NY-close offset function for imported 4h/1d; `undefined` for UTC timeframes. */
export function importedForexSessionOffset(timeframe: string): ((t: number) => number) | undefined {
  return (FOREX_SESSION_TIMEFRAMES as readonly string[]).includes(timeframe)
    ? forexNyCloseOffsetSeconds
    : undefined
}
