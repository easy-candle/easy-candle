import { describe, expect, it } from 'vitest'
import { formatTimeAgo, formatUtcCandleTime, parseUtcParts, toUtcParts } from './utcDateTime'

const NOW = Date.UTC(2024, 4, 20, 12, 0, 0)

describe('formatTimeAgo', () => {
  it('reads "just now" under a minute', () => {
    expect(formatTimeAgo(NOW - 1_000, NOW)).toBe('just now')
    expect(formatTimeAgo(NOW - 59_000, NOW)).toBe('just now')
  })

  it('counts whole minutes, then hours, then days', () => {
    expect(formatTimeAgo(NOW - 60_000, NOW)).toBe('1m ago')
    expect(formatTimeAgo(NOW - 59 * 60_000, NOW)).toBe('59m ago')
    expect(formatTimeAgo(NOW - 60 * 60_000, NOW)).toBe('1h ago')
    expect(formatTimeAgo(NOW - 23 * 3_600_000, NOW)).toBe('23h ago')
    expect(formatTimeAgo(NOW - 24 * 3_600_000, NOW)).toBe('1d ago')
    expect(formatTimeAgo(NOW - 6 * 86_400_000, NOW)).toBe('6d ago')
  })

  it('falls back to an ISO date beyond a week', () => {
    expect(formatTimeAgo(NOW - 7 * 86_400_000, NOW)).toBe('2024-05-13')
  })

  it('treats a future timestamp as just now', () => {
    expect(formatTimeAgo(NOW + 60_000, NOW)).toBe('just now')
  })

  it('renders a dash for missing or invalid input', () => {
    expect(formatTimeAgo(null, NOW)).toBe('—')
    expect(formatTimeAgo(undefined, NOW)).toBe('—')
    expect(formatTimeAgo(NaN, NOW)).toBe('—')
  })
})

describe('formatUtcCandleTime', () => {
  it('renders a UTC-suffixed timestamp', () => {
    expect(formatUtcCandleTime(Date.UTC(2024, 0, 2, 3, 4, 5) / 1000)).toBe(
      '2024-01-02 03:04:05 UTC'
    )
  })

  it('renders a dash for missing input', () => {
    expect(formatUtcCandleTime(null)).toBe('—')
    expect(formatUtcCandleTime(NaN)).toBe('—')
  })
})

describe('toUtcParts / parseUtcParts', () => {
  it('round-trips a UTC date and time', () => {
    const seconds = Date.UTC(2024, 2, 15, 8, 30, 0) / 1000
    const parts = toUtcParts(seconds)
    expect(parts).toEqual({ date: '2024-03-15', time: '08:30' })
    expect(parseUtcParts(parts.date, parts.time)).toBe(seconds)
  })

  it('rejects incomplete input', () => {
    expect(parseUtcParts('', '08:30')).toBeNull()
    expect(parseUtcParts('2024-03-15', '')).toBeNull()
    expect(parseUtcParts('nope', '08:30')).toBeNull()
  })
})
