import { describe, expect, it, vi } from 'vitest'
import { webTransports } from './webTransport'

describe('webTransports', () => {
  it('returns a no-op unsubscribe for MT bridge events', () => {
    const unsubscribe = webTransports.onMtBridgeEvent(vi.fn())
    expect(typeof unsubscribe).toBe('function')
    expect(() => unsubscribe()).not.toThrow()
  })

  it('rejects invalid klines requests locally without network', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await webTransports.fetchKlines({ symbol: 'NOPE', interval: '1m' })

    expect(result).toEqual({ ok: false, status: 400, error: 'Invalid or unsupported symbol' })
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
