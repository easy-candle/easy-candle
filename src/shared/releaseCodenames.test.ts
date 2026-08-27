import { describe, expect, it } from 'vitest'
import { getReleaseCodename, parseSemverMajor, RELEASE_CODENAMES } from './releaseCodenames'

describe('parseSemverMajor', () => {
  it('reads the major from a full build', () => {
    expect(parseSemverMajor('2.11.0')).toBe(2)
    expect(parseSemverMajor('3.0.0')).toBe(3)
  })

  it('accepts a leading v', () => {
    expect(parseSemverMajor('v2.11.0')).toBe(2)
  })

  it('returns undefined when there is no leading number', () => {
    expect(parseSemverMajor('')).toBeUndefined()
    expect(parseSemverMajor('fox')).toBeUndefined()
  })
})

describe('getReleaseCodename', () => {
  it('maps known majors to watcher slugs', () => {
    expect(getReleaseCodename('2.11.0')).toBe('fox')
    expect(getReleaseCodename('3.0.0')).toBe('owl')
    expect(getReleaseCodename('4.1.2')).toBe('wildcat')
    expect(getReleaseCodename('5.0.0')).toBe('hawk')
    expect(getReleaseCodename('6.0.0')).toBe('heron')
    expect(getReleaseCodename('7.0.0')).toBe('raven')
  })

  it('returns undefined for majors without a watcher', () => {
    expect(getReleaseCodename('1.0.0')).toBeUndefined()
    expect(getReleaseCodename('8.0.0')).toBeUndefined()
  })

  it('keeps slugs aligned with the shared table', () => {
    expect(RELEASE_CODENAMES[2]).toBe('fox')
    expect(RELEASE_CODENAMES[4]).toBe('wildcat')
  })
})
