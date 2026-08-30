import { describe, expect, it } from 'vitest'
import {
  countBySession,
  filterBySessions,
  isInSession,
  sessionsAt,
  TRADING_SESSIONS,
  tradingSessionHours,
  tradingSessionLabel,
  utcHourOf
} from './tradingSessions'

/** Unix seconds at a given UTC hour on a fixed date. */
function atHour(hour: number): number {
  return Date.UTC(2024, 4, 20, hour, 30, 0) / 1000
}

describe('utcHourOf', () => {
  it('reads the UTC hour', () => {
    expect(utcHourOf(atHour(13))).toBe(13)
    expect(utcHourOf(atHour(0))).toBe(0)
  })

  it('is null for a non-numeric input', () => {
    expect(utcHourOf(NaN)).toBeNull()
  })
})

describe('sessionsAt', () => {
  it('tags the London-only hours', () => {
    expect(sessionsAt(atHour(10))).toEqual(['london'])
  })

  it('tags the London / New York overlap', () => {
    expect(sessionsAt(atHour(14))).toEqual(['london', 'newYork'])
  })

  it('tags the Sydney / Tokyo overlap across midnight', () => {
    expect(sessionsAt(atHour(2))).toEqual(['sydney', 'tokyo'])
  })

  it('handles a window that wraps midnight from either side', () => {
    expect(sessionsAt(atHour(22))).toContain('sydney')
    expect(sessionsAt(atHour(5))).toContain('sydney')
    expect(sessionsAt(atHour(10))).not.toContain('sydney')
  })

  it('respects exclusive end hours', () => {
    // London is 07:00–16:00, so 16:xx is out.
    expect(sessionsAt(atHour(16))).not.toContain('london')
    expect(sessionsAt(atHour(15))).toContain('london')
  })

  it('is empty for an invalid time', () => {
    expect(sessionsAt(NaN)).toEqual([])
  })

  it('never leaves an hour unassigned', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(sessionsAt(atHour(hour)).length).toBeGreaterThan(0)
    }
  })
})

describe('isInSession', () => {
  it('matches a single session', () => {
    expect(isInSession(atHour(13), 'newYork')).toBe(true)
    expect(isInSession(atHour(13), 'tokyo')).toBe(false)
  })

  it('is false for an invalid time', () => {
    expect(isInSession(NaN, 'london')).toBe(false)
  })
})

describe('filterBySessions', () => {
  const items = [
    { id: 'tokyo-trade', time: atHour(3) },
    { id: 'london-trade', time: atHour(9) },
    { id: 'ny-trade', time: atHour(18) }
  ]
  const timeOf = (item: { time: number }): number => item.time

  it('passes everything through with an empty selection', () => {
    expect(filterBySessions(items, [], timeOf)).toHaveLength(3)
  })

  it('keeps only the selected session', () => {
    expect(filterBySessions(items, ['london'], timeOf).map((i) => i.id)).toEqual(['london-trade'])
  })

  it('unions multiple selections', () => {
    const kept = filterBySessions(items, ['tokyo', 'newYork'], timeOf).map((i) => i.id)
    expect(kept).toEqual(['tokyo-trade', 'ny-trade'])
  })

  it('keeps an item that overlaps any selected session', () => {
    const overlap = [{ id: 'overlap', time: atHour(14) }]
    expect(filterBySessions(overlap, ['london'], timeOf)).toHaveLength(1)
    expect(filterBySessions(overlap, ['newYork'], timeOf)).toHaveLength(1)
    expect(filterBySessions(overlap, ['tokyo'], timeOf)).toHaveLength(0)
  })

  it('drops items with an unusable time when filtering', () => {
    const withBad = [...items, { id: 'bad', time: NaN }]
    expect(filterBySessions(withBad, ['london'], timeOf).map((i) => i.id)).toEqual(['london-trade'])
  })
})

describe('countBySession', () => {
  it('counts an overlapping item under both sessions', () => {
    const counts = countBySession([{ time: atHour(14) }], (item) => item.time)
    expect(counts.london).toBe(1)
    expect(counts.newYork).toBe(1)
    expect(counts.tokyo).toBe(0)
  })

  it('starts every session at zero', () => {
    expect(countBySession([], (item: { time: number }) => item.time)).toEqual({
      sydney: 0,
      tokyo: 0,
      london: 0,
      newYork: 0
    })
  })
})

describe('labels', () => {
  it('exposes a label and an hour range for every session', () => {
    for (const session of TRADING_SESSIONS) {
      expect(tradingSessionLabel(session.id)).toBe(session.label)
      expect(tradingSessionHours(session.id)).toMatch(/^\d{2}:00–\d{2}:00$/)
    }
  })

  it('formats the wrapping Sydney window', () => {
    expect(tradingSessionHours('sydney')).toBe('21:00–06:00')
  })
})
