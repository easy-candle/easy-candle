/**
 * FX trading sessions, keyed off the UTC hour a trade was entered.
 *
 * Windows use standard-time hours and do not shift with DST, so a trade near a
 * boundary can land in the neighbouring session for part of the year. That is
 * the usual convention for session tagging and keeps the buckets stable.
 *
 * Sessions overlap by design (London/New York, Sydney/Tokyo), so a trade can
 * belong to more than one.
 */

export type TradingSessionId = 'sydney' | 'tokyo' | 'london' | 'newYork'

export type TradingSession = {
  id: TradingSessionId
  label: string
  /** Inclusive UTC start hour. */
  startHour: number
  /** Exclusive UTC end hour; less than `startHour` when the window wraps midnight. */
  endHour: number
}

export const TRADING_SESSIONS: readonly TradingSession[] = [
  { id: 'sydney', label: 'Sydney', startHour: 21, endHour: 6 },
  { id: 'tokyo', label: 'Tokyo', startHour: 0, endHour: 9 },
  { id: 'london', label: 'London', startHour: 7, endHour: 16 },
  { id: 'newYork', label: 'New York', startHour: 12, endHour: 21 }
]

const BY_ID = new Map(TRADING_SESSIONS.map((session) => [session.id, session]))

export function tradingSessionLabel(id: TradingSessionId): string {
  return BY_ID.get(id)?.label ?? id
}

/** UTC hour range as a short label, e.g. `21:00–06:00`. */
export function tradingSessionHours(id: TradingSessionId): string {
  const session = BY_ID.get(id)
  if (!session) return ''
  const pad = (hour: number): string => `${String(hour).padStart(2, '0')}:00`
  return `${pad(session.startHour)}–${pad(session.endHour)}`
}

function hourInWindow(hour: number, session: TradingSession): boolean {
  if (session.startHour <= session.endHour) {
    return hour >= session.startHour && hour < session.endHour
  }
  // Wraps midnight: in the window if after the start or before the end.
  return hour >= session.startHour || hour < session.endHour
}

/** UTC hour of a unix timestamp in seconds, or null when not a finite number. */
export function utcHourOf(unixSeconds: number): number | null {
  if (!Number.isFinite(unixSeconds)) return null
  return new Date(unixSeconds * 1000).getUTCHours()
}

/** Every session covering `unixSeconds`; empty when the input is invalid. */
export function sessionsAt(unixSeconds: number): TradingSessionId[] {
  const hour = utcHourOf(unixSeconds)
  if (hour == null) return []
  return TRADING_SESSIONS.filter((session) => hourInWindow(hour, session)).map(
    (session) => session.id
  )
}

export function isInSession(unixSeconds: number, id: TradingSessionId): boolean {
  const hour = utcHourOf(unixSeconds)
  const session = BY_ID.get(id)
  if (hour == null || !session) return false
  return hourInWindow(hour, session)
}

/**
 * Keep items entered during any of `selected`. An empty selection means "no
 * filter" and passes everything through, matching how the UI reads.
 */
export function filterBySessions<T>(
  items: T[],
  selected: TradingSessionId[],
  timeOf: (item: T) => number
): T[] {
  const list = Array.isArray(items) ? items : []
  if (!Array.isArray(selected) || selected.length === 0) return list

  const wanted = new Set(selected)
  return list.filter((item) => sessionsAt(timeOf(item)).some((id) => wanted.has(id)))
}

/** Count of items per session, for badges next to each filter option. */
export function countBySession<T>(
  items: T[],
  timeOf: (item: T) => number
): Record<TradingSessionId, number> {
  const counts: Record<TradingSessionId, number> = {
    sydney: 0,
    tokyo: 0,
    london: 0,
    newYork: 0
  }

  for (const item of Array.isArray(items) ? items : []) {
    for (const id of sessionsAt(timeOf(item))) counts[id] += 1
  }

  return counts
}
