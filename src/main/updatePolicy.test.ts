import { describe, expect, it } from 'vitest'
import { evaluateUpdatePolicy } from './updatePolicy'
import type { AppStatus } from '@shared/appStatus'

const status = (minVersion: string, liveVersion?: string): AppStatus => ({
  ok: true,
  minVersion,
  store: {
    productId: '9N91GNR9SJ14',
    url: 'ms-windows-store://pdp/?productid=9N91GNR9SJ14',
    webUrl: 'https://apps.microsoft.com/detail/9N91GNR9SJ14',
    ...(liveVersion ? { liveVersion } : {})
  }
})

describe('evaluateUpdatePolicy', () => {
  it('sets force from latest.yml mandatory even when current is supported', () => {
    const result = evaluateUpdatePolicy({
      channel: 'github',
      currentVersion: '2.12.1',
      status: status('2.10.0'),
      mandatory: true
    })
    expect(result.force).toBe(true)
    expect(result.unsupported).toBe(false)
    expect(result.blockStore).toBe(false)
  })

  it('sets unsupported and force when current is below minVersion', () => {
    const result = evaluateUpdatePolicy({
      channel: 'github',
      currentVersion: '2.10.0',
      status: status('2.12.1'),
      mandatory: false
    })
    expect(result.unsupported).toBe(true)
    expect(result.force).toBe(true)
    expect(result.blockStore).toBe(false)
  })

  it('blocks Store only when unsupported and catalog liveVersion meets minVersion', () => {
    const result = evaluateUpdatePolicy({
      channel: 'store',
      currentVersion: '2.10.0',
      status: status('2.12.1'),
      storeLiveVersion: '2.12.1'
    })
    expect(result.unsupported).toBe(true)
    expect(result.force).toBe(true)
    expect(result.blockStore).toBe(true)
  })

  it('does not block Store when catalog fetch failed (fail-open)', () => {
    const result = evaluateUpdatePolicy({
      channel: 'store',
      currentVersion: '2.10.0',
      status: status('2.12.1'),
      storeLiveVersion: null
    })
    expect(result.unsupported).toBe(true)
    expect(result.force).toBe(false)
    expect(result.blockStore).toBe(false)
  })

  it('does not block Store when liveVersion is still below minVersion', () => {
    const result = evaluateUpdatePolicy({
      channel: 'store',
      currentVersion: '2.10.0',
      status: status('2.12.1'),
      storeLiveVersion: '2.11.0'
    })
    expect(result.unsupported).toBe(true)
    expect(result.force).toBe(false)
    expect(result.blockStore).toBe(false)
  })

  it('does not use liveVersion from GET /status', () => {
    const result = evaluateUpdatePolicy({
      channel: 'store',
      currentVersion: '2.10.0',
      status: status('2.12.1', '2.12.1')
    })
    expect(result.blockStore).toBe(false)
    expect(result.storeLiveVersion).toBeNull()
  })

  it('fail-opens when status is missing', () => {
    const result = evaluateUpdatePolicy({
      channel: 'store',
      currentVersion: '2.10.0',
      status: null,
      storeLiveVersion: '2.12.1'
    })
    expect(result.unsupported).toBe(false)
    expect(result.force).toBe(false)
    expect(result.blockStore).toBe(false)
    expect(result.minVersion).toBeNull()
  })
})
