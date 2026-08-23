import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from './channels'

describe('IPC_CHANNELS', () => {
  it('has no duplicate channel names', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('namespaces every channel as domain:action', () => {
    for (const channel of Object.values(IPC_CHANNELS)) {
      expect(channel).toMatch(/^[a-z]+:[a-zA-Z-]+$/)
    }
  })
})
