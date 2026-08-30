import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { showToast, TOAST_TIMEOUT_MS, useToastStore } from '@/store/toastStore'

beforeEach(() => {
  vi.useFakeTimers()
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  useToastStore.getState().clearToasts()
  vi.useRealTimers()
})

describe('showToast', () => {
  it('queues a toast with its tone and message', () => {
    useToastStore.getState().showToast('success', 'Saved')
    const [toast] = useToastStore.getState().toasts
    expect(toast).toMatchObject({ tone: 'success', message: 'Saved' })
  })

  it('trims the message and ignores blank ones', () => {
    useToastStore.getState().showToast('info', '  padded  ')
    useToastStore.getState().showToast('info', '   ')
    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('padded')
  })

  it('hands out unique ids', () => {
    const first = useToastStore.getState().showToast('info', 'one')
    const second = useToastStore.getState().showToast('info', 'two')
    expect(first).not.toBe(second)
  })

  it('keeps only the newest few so the chart stays visible', () => {
    for (const message of ['a', 'b', 'c', 'd', 'e']) {
      useToastStore.getState().showToast('info', message)
    }
    const messages = useToastStore.getState().toasts.map((toast) => toast.message)
    expect(messages).toEqual(['c', 'd', 'e'])
  })

  it('is reachable from outside React', () => {
    showToast('error', 'from a store')
    expect(useToastStore.getState().toasts[0].message).toBe('from a store')
  })
})

describe('auto dismiss', () => {
  it('drops a toast once its timeout elapses', () => {
    useToastStore.getState().showToast('info', 'temporary')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(TOAST_TIMEOUT_MS)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('times each toast independently', () => {
    useToastStore.getState().showToast('info', 'first')
    vi.advanceTimersByTime(TOAST_TIMEOUT_MS / 2)
    useToastStore.getState().showToast('info', 'second')

    vi.advanceTimersByTime(TOAST_TIMEOUT_MS / 2)
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['second'])

    vi.advanceTimersByTime(TOAST_TIMEOUT_MS / 2)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})

describe('dismissToast', () => {
  it('removes just that toast', () => {
    const first = useToastStore.getState().showToast('info', 'keep')
    const second = useToastStore.getState().showToast('info', 'drop')
    useToastStore.getState().dismissToast(second)

    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].id).toBe(first)
  })

  it('ignores an unknown id', () => {
    useToastStore.getState().showToast('info', 'stay')
    useToastStore.getState().dismissToast(9999)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('cancels the pending timer, so a reused id cannot be dropped later', () => {
    const id = useToastStore.getState().showToast('info', 'manual')
    useToastStore.getState().dismissToast(id)
    useToastStore.getState().showToast('info', 'next')
    vi.advanceTimersByTime(TOAST_TIMEOUT_MS - 1)
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })
})

describe('clearToasts', () => {
  it('empties the stack', () => {
    useToastStore.getState().showToast('info', 'a')
    useToastStore.getState().showToast('error', 'b')
    useToastStore.getState().clearToasts()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
