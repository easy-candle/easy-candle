/** Session display timezones for the chart. Candle `time` stays UTC unix seconds. */

export type ChartTimezone = {
  id: string
  city: string
  region: string
}

export const DEFAULT_CHART_TIMEZONE = 'UTC'

function ianaLabel(id: string): { city: string; region: string } {
  if (id === 'UTC' || id === 'Etc/UTC') return { city: 'UTC', region: '' }
  const parts = id.split('/')
  const city = (parts.pop() ?? id).replaceAll('_', ' ')
  const region = parts.join(' / ').replaceAll('_', ' ')
  return { city, region }
}

function supportedIanaTimeZones(): string[] {
  if (typeof Intl === 'undefined' || typeof Intl.supportedValuesOf !== 'function') {
    return []
  }
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
}

function listChartTimezones(): ChartTimezone[] {
  const ids = new Set<string>([DEFAULT_CHART_TIMEZONE])
  for (const id of supportedIanaTimeZones()) {
    if (id === 'UTC' || id === 'Etc/UTC') continue
    ids.add(id)
  }

  const zones: ChartTimezone[] = []
  for (const id of ids) {
    const { city, region } = ianaLabel(id)
    zones.push({ id, city, region })
  }

  zones.sort((a, b) => {
    if (a.id === DEFAULT_CHART_TIMEZONE) return -1
    if (b.id === DEFAULT_CHART_TIMEZONE) return 1
    const regionCmp = a.region.localeCompare(b.region)
    if (regionCmp !== 0) return regionCmp
    return a.city.localeCompare(b.city)
  })
  return zones
}

/** All IANA time zones supported by this runtime, with UTC first. */
export const CHART_TIMEZONES: readonly ChartTimezone[] = listChartTimezones()

const TIMEZONE_IDS = new Set(CHART_TIMEZONES.map((zone) => zone.id))

export function isValidIanaTimeZone(id: string): boolean {
  if (id === DEFAULT_CHART_TIMEZONE || id === 'Etc/UTC') return true
  if (TIMEZONE_IDS.has(id)) return true
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: id })
    return true
  } catch {
    return false
  }
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
] as const

/** Matches lightweight-charts `TickMarkType`. */
export const ChartTickMarkType = {
  Year: 0,
  Month: 1,
  DayOfMonth: 2,
  Time: 3,
  TimeWithSeconds: 4
} as const

export type SessionDateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

type FormatSessionOptions = {
  seconds?: boolean
  offset?: boolean
}

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()

export function isChartTimezone(id: string): boolean {
  return isValidIanaTimeZone(id)
}

export function sanitizeTimezone(value: unknown): string {
  if (typeof value !== 'string' || !value) return DEFAULT_CHART_TIMEZONE
  if (value === 'Etc/UTC') return DEFAULT_CHART_TIMEZONE
  return isValidIanaTimeZone(value) ? value : DEFAULT_CHART_TIMEZONE
}

export function chartTimezoneById(id: string): ChartTimezone {
  const zoneId = sanitizeTimezone(id)
  const found = CHART_TIMEZONES.find((zone) => zone.id === zoneId)
  if (found) return found
  const { city, region } = ianaLabel(zoneId)
  return { id: zoneId, city, region }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function dateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const zone = sanitizeTimezone(timeZone)
  let formatter = dateTimeFormatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      hour12: false
    })
    dateTimeFormatters.set(zone, formatter)
  }
  return formatter
}

function partNumber(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((part) => part.type === type)?.value)
}

export function sessionDateTimeParts(
  unixSeconds: number,
  timeZone: string
): SessionDateTimeParts | null {
  if (!Number.isFinite(unixSeconds)) return null
  const date = new Date(unixSeconds * 1000)
  if (Number.isNaN(date.getTime())) return null

  try {
    const parts = dateTimeFormatter(timeZone).formatToParts(date)
    const hour = partNumber(parts, 'hour')
    const result: SessionDateTimeParts = {
      year: partNumber(parts, 'year'),
      month: partNumber(parts, 'month'),
      day: partNumber(parts, 'day'),
      hour: hour === 24 ? 0 : hour,
      minute: partNumber(parts, 'minute'),
      second: partNumber(parts, 'second')
    }
    if (
      !Number.isFinite(result.year) ||
      !Number.isFinite(result.month) ||
      !Number.isFinite(result.day) ||
      !Number.isFinite(result.hour) ||
      !Number.isFinite(result.minute) ||
      !Number.isFinite(result.second)
    ) {
      return null
    }
    return result
  } catch {
    return null
  }
}

/** Seconds east of UTC at `unixSeconds` in `timeZone` (DST-aware). */
export function sessionOffsetSeconds(unixSeconds: number, timeZone: string): number {
  const parts = sessionDateTimeParts(unixSeconds, timeZone)
  if (!parts) return 0
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  return Math.round((asUtc - unixSeconds * 1000) / 1000)
}

export function sessionUtcOffsetLabel(
  timeZone: string,
  atSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const offset = sessionOffsetSeconds(atSeconds, sanitizeTimezone(timeZone))
  if (offset === 0) return 'UTC'
  const sign = offset > 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const hours = Math.floor(abs / 3600)
  const minutes = Math.floor((abs % 3600) / 60)
  if (minutes === 0) return `UTC${sign}${hours}`
  return `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`
}

export function sessionTimezoneTitle(
  timeZone: string,
  atSeconds: number = Math.floor(Date.now() / 1000)
): string {
  const zone = chartTimezoneById(sanitizeTimezone(timeZone))
  const offset = sessionUtcOffsetLabel(zone.id, atSeconds)
  if (zone.id === DEFAULT_CHART_TIMEZONE) return offset
  const place = zone.region ? `${zone.city}, ${zone.region}` : zone.city
  return `${place} (${offset})`
}

export function formatSessionCandleTime(
  unixSeconds: number | null | undefined,
  timeZone: string,
  options: FormatSessionOptions = {}
): string {
  if (unixSeconds == null || !Number.isFinite(unixSeconds)) return '—'
  const parts = sessionDateTimeParts(unixSeconds, timeZone)
  if (!parts) return '—'

  const showSeconds = options.seconds !== false
  const showOffset = options.offset !== false
  const wall = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}${
    showSeconds ? `:${pad2(parts.second)}` : ''
  }`
  if (!showOffset) return wall
  return `${wall} ${sessionUtcOffsetLabel(timeZone, unixSeconds)}`
}

export function tickMarkLabel(unixSeconds: number, tickMarkType: number, timeZone: string): string {
  const parts = sessionDateTimeParts(unixSeconds, timeZone)
  if (!parts) return ''

  switch (tickMarkType) {
    case ChartTickMarkType.Year:
      return String(parts.year)
    case ChartTickMarkType.Month:
      return MONTH_SHORT[parts.month - 1] ?? pad2(parts.month)
    case ChartTickMarkType.DayOfMonth:
      return String(parts.day)
    case ChartTickMarkType.TimeWithSeconds:
      return `${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`
    case ChartTickMarkType.Time:
    default:
      return `${pad2(parts.hour)}:${pad2(parts.minute)}`
  }
}

export function toSessionParts(
  unixSeconds: number,
  timeZone: string
): { date: string; time: string } {
  const parts = sessionDateTimeParts(unixSeconds, timeZone)
  if (!parts) return { date: '', time: '' }
  return {
    date: `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`,
    time: `${pad2(parts.hour)}:${pad2(parts.minute)}`
  }
}

export function defaultSessionParts(
  offsetDays = 7,
  timeZone = DEFAULT_CHART_TIMEZONE
): { date: string; time: string } {
  const ms = Date.now() - offsetDays * 24 * 60 * 60 * 1000
  return toSessionParts(Math.floor(ms / 1000), timeZone)
}

/** Parse `YYYY-MM-DD` + `HH:mm` wall-clock in `timeZone` → UTC unix seconds. */
export function parseSessionParts(date: string, time: string, timeZone: string): number | null {
  if (!date || !time) return null

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time)
  if (!dateMatch || !timeMatch) return null

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const second = Number(timeMatch[3] ?? '0')
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null

  const zone = sanitizeTimezone(timeZone)
  const asUtcMs = Date.UTC(year, month - 1, day, hour, minute, second)
  if (!Number.isFinite(asUtcMs)) return null

  const guessSeconds = Math.floor(asUtcMs / 1000)
  const offset1 = sessionOffsetSeconds(guessSeconds, zone)
  let utcSeconds = guessSeconds - offset1
  const offset2 = sessionOffsetSeconds(utcSeconds, zone)
  if (offset2 !== offset1) {
    utcSeconds = guessSeconds - offset2
  }
  return utcSeconds
}

export function unixSecondsFromChartTime(time: unknown): number | null {
  if (typeof time === 'number' && Number.isFinite(time)) return time
  if (typeof time === 'string') {
    const ms = Date.parse(time)
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
  }
  if (time && typeof time === 'object') {
    const rec = time as { year?: unknown; month?: unknown; day?: unknown }
    if (
      typeof rec.year === 'number' &&
      typeof rec.month === 'number' &&
      typeof rec.day === 'number'
    ) {
      return Math.floor(Date.UTC(rec.year, rec.month - 1, rec.day) / 1000)
    }
  }
  return null
}
