/** UTC date/time helpers for replay start + jump inputs. */

export function nowUtcSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export function defaultUtcParts(offsetDays = 7): { date: string; time: string } {
  const ms = Date.now() - offsetDays * 24 * 60 * 60 * 1000
  return toUtcParts(Math.floor(ms / 1000))
}

export function toUtcParts(unixSeconds: number): { date: string; time: string } {
  const d = new Date(unixSeconds * 1000)
  if (Number.isNaN(d.getTime())) {
    return { date: '', time: '' }
  }

  const date = d.toISOString().slice(0, 10)
  const time = d.toISOString().slice(11, 16)
  return { date, time }
}

/** Parse `YYYY-MM-DD` + `HH:mm` as UTC → unix seconds. */
export function parseUtcParts(date: string, time: string): number | null {
  if (!date || !time) return null

  const iso = `${date}T${time}:00.000Z`
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return Math.floor(ms / 1000)
}

export function formatUtcCandleTime(unixSeconds: number | null | undefined): string {
  if (unixSeconds == null || !Number.isFinite(unixSeconds)) return '—'
  return new Date(unixSeconds * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC')
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * Coarse "how long ago" label for wall-clock timestamps in ms, e.g. when a
 * session was last saved. Deliberately low-resolution: these lists are scanned,
 * not read precisely. Future timestamps (clock skew) read as "just now".
 */
export function formatTimeAgo(timestampMs: number | null | undefined, nowMs = Date.now()): string {
  if (timestampMs == null || !Number.isFinite(timestampMs)) return '—'

  const elapsed = nowMs - timestampMs
  if (elapsed < MINUTE_MS) return 'just now'
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`
  if (elapsed < 7 * DAY_MS) return `${Math.floor(elapsed / DAY_MS)}d ago`

  return new Date(timestampMs).toISOString().slice(0, 10)
}
