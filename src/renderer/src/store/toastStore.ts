import { create } from 'zustand'

/** How long a toast stays up before it dismisses itself. */
export const TOAST_TIMEOUT_MS = 5000

export type ToastTone = 'info' | 'success' | 'error'

export type Toast = {
  id: number
  tone: ToastTone
  message: string
}

type ToastState = {
  /** Newest last; the renderer stacks them bottom-up. */
  toasts: Toast[]
  /** Queue a toast and return its id, so callers can dismiss it early. */
  showToast: (tone: ToastTone, message: string) => number
  dismissToast: (id: number) => void
  clearToasts: () => void
}

/** Cap the stack so a burst of messages cannot cover the chart. */
const MAX_TOASTS = 3

let nextId = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function clearTimer(id: number): void {
  const timer = timers.get(id)
  if (timer == null) return
  clearTimeout(timer)
  timers.delete(id)
}

/**
 * App-wide transient notifications. Lives in a store rather than component
 * state so any component can post one without prop drilling — the chart shell
 * owns rendering.
 */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  showToast(tone, message) {
    const text = message.trim()
    const id = (nextId += 1)
    if (!text) return id

    set((state) => ({ toasts: [...state.toasts, { id, tone, message: text }].slice(-MAX_TOASTS) }))

    timers.set(
      id,
      setTimeout(() => get().dismissToast(id), TOAST_TIMEOUT_MS)
    )
    return id
  },

  dismissToast(id) {
    clearTimer(id)
    set((state) => {
      const toasts = state.toasts.filter((toast) => toast.id !== id)
      return toasts.length === state.toasts.length ? state : { toasts }
    })
  },

  clearToasts() {
    for (const id of timers.keys()) clearTimer(id)
    if (get().toasts.length === 0) return
    set({ toasts: [] })
  }
}))

/** Post a toast from outside React (stores, async handlers). */
export function showToast(tone: ToastTone, message: string): number {
  return useToastStore.getState().showToast(tone, message)
}
