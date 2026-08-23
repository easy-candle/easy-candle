import { describe, expect, it } from 'vitest'
import { DataSourceError, dataSourceErrorKindFromStatus, toDataSourceError } from './errors'

describe('dataSourceErrorKindFromStatus', () => {
  it('maps rate limits and blocking to dedicated kinds', () => {
    expect(dataSourceErrorKindFromStatus(429)).toBe('rate-limit')
    expect(dataSourceErrorKindFromStatus(418)).toBe('unavailable')
    expect(dataSourceErrorKindFromStatus(503)).toBe('unavailable')
  })

  it('maps 404 and client errors', () => {
    expect(dataSourceErrorKindFromStatus(404)).toBe('not-found')
    expect(dataSourceErrorKindFromStatus(400)).toBe('invalid-input')
    expect(dataSourceErrorKindFromStatus(422)).toBe('invalid-input')
  })

  it('maps everything else to upstream', () => {
    expect(dataSourceErrorKindFromStatus(500)).toBe('upstream')
    expect(dataSourceErrorKindFromStatus(502)).toBe('upstream')
  })
})

describe('toDataSourceError', () => {
  it('passes DataSourceError instances through untouched', () => {
    const original = new DataSourceError('rate-limit', 'slow down', 'detail')
    expect(toDataSourceError(original)).toBe(original)
  })

  it('wraps Error instances keeping their message', () => {
    const wrapped = toDataSourceError(new Error('socket hung up'))
    expect(wrapped).toBeInstanceOf(DataSourceError)
    expect(wrapped.kind).toBe('unknown')
    expect(wrapped.message).toBe('socket hung up')
  })

  it('falls back for non-error values', () => {
    const wrapped = toDataSourceError(42, 'request failed')
    expect(wrapped.kind).toBe('unknown')
    expect(wrapped.message).toBe('request failed')
  })
})

describe('DataSourceError', () => {
  it('keeps kind and detail separate from the message', () => {
    const err = new DataSourceError('unavailable', 'temporarily down', '503 from edge')
    expect(err.kind).toBe('unavailable')
    expect(err.detail).toBe('503 from edge')
    expect(err.message).toBe('temporarily down')
    expect(err.name).toBe('DataSourceError')
  })
})
