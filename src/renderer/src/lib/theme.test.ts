import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
  toggleTheme
} from './theme'

function mockStorage(initial: Record<string, string> = {}): Record<string, string> {
  const store = { ...initial }
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    }
  })
  return store
}

function mockDocument(): { dataset: Record<string, string>; style: { colorScheme: string } } {
  const documentElement = {
    dataset: {} as Record<string, string>,
    style: { colorScheme: '' }
  }
  vi.stubGlobal('document', { documentElement })
  return documentElement
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getStoredTheme', () => {
  it('defaults to dark when storage is empty', () => {
    mockStorage()
    expect(getStoredTheme()).toBe('dark')
  })

  it('returns a stored light theme', () => {
    mockStorage({ [THEME_STORAGE_KEY]: 'light' })
    expect(getStoredTheme()).toBe('light')
  })

  it('returns dark when storage is invalid', () => {
    mockStorage({ [THEME_STORAGE_KEY]: 'system' })
    expect(getStoredTheme()).toBe('dark')
  })

  it('returns dark when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      }
    })
    expect(getStoredTheme()).toBe('dark')
  })
})

describe('applyTheme', () => {
  it('sets data-theme and color-scheme on documentElement', () => {
    const root = mockDocument()
    applyTheme('light')
    expect(root.dataset.theme).toBe('light')
    expect(root.style.colorScheme).toBe('light')
  })
})

describe('toggleTheme', () => {
  it('flips dark to light, persists, and applies', () => {
    const store = mockStorage()
    const root = mockDocument()
    expect(toggleTheme()).toBe('light')
    expect(store[THEME_STORAGE_KEY]).toBe('light')
    expect(root.dataset.theme).toBe('light')
    expect(root.style.colorScheme).toBe('light')
  })

  it('flips light back to dark', () => {
    const store = mockStorage({ [THEME_STORAGE_KEY]: 'light' })
    const root = mockDocument()
    expect(toggleTheme()).toBe('dark')
    expect(store[THEME_STORAGE_KEY]).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
  })
})
