import { describe, expect, it } from 'vitest'
import {
  CHART_TIMEZONES,
  ChartTickMarkType,
  DEFAULT_CHART_TIMEZONE,
  formatSessionCandleTime,
  parseSessionParts,
  sanitizeTimezone,
  sessionUtcOffsetLabel,
  tickMarkLabel,
  toSessionParts
} from './chartTimezone'

function utcSeconds(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): number {
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute, second) / 1000)
}

describe('sanitizeTimezone', () => {
  it('keeps any valid IANA id and falls back to UTC', () => {
    expect(sanitizeTimezone('Europe/Istanbul')).toBe('Europe/Istanbul')
    expect(sanitizeTimezone('Pacific/Honolulu')).toBe('Pacific/Honolulu')
    expect(sanitizeTimezone('America/Argentina/Buenos_Aires')).toBe(
      'America/Argentina/Buenos_Aires'
    )
    expect(sanitizeTimezone('Etc/UTC')).toBe(DEFAULT_CHART_TIMEZONE)
    expect(sanitizeTimezone('Not/AZone')).toBe(DEFAULT_CHART_TIMEZONE)
    expect(sanitizeTimezone(null)).toBe(DEFAULT_CHART_TIMEZONE)
  })
})

describe('CHART_TIMEZONES', () => {
  it('lists the full IANA catalog with UTC first', () => {
    expect(CHART_TIMEZONES[0]?.id).toBe('UTC')
    expect(CHART_TIMEZONES.length).toBeGreaterThan(100)
    const ids = new Set(CHART_TIMEZONES.map((zone) => zone.id))
    expect(ids.has('Europe/Istanbul')).toBe(true)
    expect(ids.has('Pacific/Honolulu')).toBe(true)
    expect(ids.has('America/Buenos_Aires')).toBe(true)
  })
})

describe('formatSessionCandleTime', () => {
  it('keeps UTC wall-clock unchanged', () => {
    const time = utcSeconds(2018, 6, 25, 4, 0, 0)
    expect(formatSessionCandleTime(time, 'UTC')).toBe('2018-06-25 04:00:00 UTC')
  })

  it('shifts Istanbul by UTC+3 in both winter and summer', () => {
    const winter = utcSeconds(2024, 1, 15, 12, 0, 0)
    const summer = utcSeconds(2024, 7, 15, 12, 0, 0)
    expect(formatSessionCandleTime(winter, 'Europe/Istanbul')).toBe('2024-01-15 15:00:00 UTC+3')
    expect(formatSessionCandleTime(summer, 'Europe/Istanbul')).toBe('2024-07-15 15:00:00 UTC+3')
    expect(sessionUtcOffsetLabel('Europe/Istanbul', winter)).toBe('UTC+3')
    expect(sessionUtcOffsetLabel('Europe/Istanbul', summer)).toBe('UTC+3')
  })

  it('applies US DST for New York', () => {
    const est = utcSeconds(2024, 1, 15, 17, 0, 0)
    const edt = utcSeconds(2024, 7, 15, 16, 0, 0)
    expect(formatSessionCandleTime(est, 'America/New_York')).toBe('2024-01-15 12:00:00 UTC-5')
    expect(formatSessionCandleTime(edt, 'America/New_York')).toBe('2024-07-15 12:00:00 UTC-4')
  })

  it('switches New York offset at the 2024 DST boundaries', () => {
    const beforeSpring = utcSeconds(2024, 3, 10, 6, 59, 0)
    const afterSpring = utcSeconds(2024, 3, 10, 7, 0, 0)
    const beforeFall = utcSeconds(2024, 11, 3, 5, 59, 0)
    const afterFall = utcSeconds(2024, 11, 3, 6, 0, 0)
    expect(formatSessionCandleTime(beforeSpring, 'America/New_York')).toBe(
      '2024-03-10 01:59:00 UTC-5'
    )
    expect(formatSessionCandleTime(afterSpring, 'America/New_York')).toBe(
      '2024-03-10 03:00:00 UTC-4'
    )
    expect(formatSessionCandleTime(beforeFall, 'America/New_York')).toBe(
      '2024-11-03 01:59:00 UTC-4'
    )
    expect(formatSessionCandleTime(afterFall, 'America/New_York')).toBe('2024-11-03 01:00:00 UTC-5')
  })

  it('applies BST for London', () => {
    const gmt = utcSeconds(2024, 1, 15, 12, 0, 0)
    const bst = utcSeconds(2024, 7, 15, 12, 0, 0)
    expect(formatSessionCandleTime(gmt, 'Europe/London')).toBe('2024-01-15 12:00:00 UTC')
    expect(formatSessionCandleTime(bst, 'Europe/London')).toBe('2024-07-15 13:00:00 UTC+1')
  })

  it('omits the offset suffix when requested', () => {
    const time = utcSeconds(2024, 7, 15, 12, 0, 0)
    expect(formatSessionCandleTime(time, 'Europe/Istanbul', { offset: false })).toBe(
      '2024-07-15 15:00:00'
    )
  })
})

describe('parseSessionParts / toSessionParts', () => {
  it('parses Istanbul wall-clock back to UTC seconds', () => {
    const utc = utcSeconds(2024, 7, 15, 12, 0, 0)
    expect(parseSessionParts('2024-07-15', '15:00', 'Europe/Istanbul')).toBe(utc)
    expect(toSessionParts(utc, 'Europe/Istanbul')).toEqual({ date: '2024-07-15', time: '15:00' })
  })

  it('round-trips New York across DST', () => {
    const winter = utcSeconds(2024, 1, 15, 17, 0, 0)
    const summer = utcSeconds(2024, 7, 15, 16, 0, 0)
    expect(parseSessionParts('2024-01-15', '12:00', 'America/New_York')).toBe(winter)
    expect(parseSessionParts('2024-07-15', '12:00', 'America/New_York')).toBe(summer)
  })

  it('round-trips London across BST', () => {
    const gmt = utcSeconds(2024, 1, 15, 12, 0, 0)
    const bst = utcSeconds(2024, 7, 15, 12, 0, 0)
    expect(parseSessionParts('2024-01-15', '12:00', 'Europe/London')).toBe(gmt)
    expect(parseSessionParts('2024-07-15', '13:00', 'Europe/London')).toBe(bst)
  })

  it('treats UTC parse as identity', () => {
    const utc = utcSeconds(2024, 6, 25, 4, 30, 0)
    expect(parseSessionParts('2024-06-25', '04:30', 'UTC')).toBe(utc)
  })
})

describe('tickMarkLabel', () => {
  it('formats axis ticks in the session zone', () => {
    const time = utcSeconds(2024, 7, 15, 12, 0, 0)
    expect(tickMarkLabel(time, ChartTickMarkType.Year, 'Europe/Istanbul')).toBe('2024')
    expect(tickMarkLabel(time, ChartTickMarkType.Month, 'Europe/Istanbul')).toBe('Jul')
    expect(tickMarkLabel(time, ChartTickMarkType.DayOfMonth, 'Europe/Istanbul')).toBe('15')
    expect(tickMarkLabel(time, ChartTickMarkType.Time, 'Europe/Istanbul')).toBe('15:00')
    expect(tickMarkLabel(time, ChartTickMarkType.TimeWithSeconds, 'Europe/Istanbul')).toBe(
      '15:00:00'
    )
  })
})
