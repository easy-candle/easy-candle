import { createPortal } from 'react-dom'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useToastStore, type ToastTone } from '@/store/toastStore'

const TONE_CLASS: Record<ToastTone, string> = {
  info: 'border-zinc-800/50 text-amber-200/90',
  success: 'border-emerald-900/60 text-emerald-200',
  error: 'border-red-900/60 text-red-200'
}

const TONE_ICON: Record<ToastTone, typeof Info> = {
  info: Info,
  success: CircleCheck,
  error: CircleAlert
}

/** Bottom-right transient notifications, newest at the bottom. */
export default function ToastStack() {
  const toasts = useToastStore((s) => s.toasts)
  const dismissToast = useToastStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = TONE_ICON[toast.tone]
        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-center gap-2 rounded border bg-zinc-950/95 px-3 py-2.5 text-xs leading-relaxed shadow-xl shadow-black/50 ${
              TONE_CLASS[toast.tone]
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 break-words">{toast.message}</p>
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => dismissToast(toast.id)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-gray-400 opacity-80 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )
      })}
    </div>,
    document.body
  )
}
