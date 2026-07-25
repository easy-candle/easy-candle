/** UTC date/time helpers for replay start + jump inputs. */

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
