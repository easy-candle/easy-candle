import { useEffect } from 'react'
import { X } from 'lucide-react'

type SignInRequiredDialogProps = {
  open: boolean
  indicatorLabel: string
  onOk: () => void
  onDismiss: () => void
}

export default function SignInRequiredDialog({
  open,
  indicatorLabel,
  onOk,
  onDismiss
}: SignInRequiredDialogProps) {
  useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onDismiss()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-required-title"
        className="w-full max-w-[22rem] overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <h2 id="signin-required-title" className="text-sm font-semibold text-amber-400">
            Sign in required
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onDismiss}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="space-y-4 px-4 py-4">
          <p className="text-sm text-zinc-300">
            Sign in to use the {indicatorLabel} indicator.
          </p>
          <button
            type="button"
            onClick={onOk}
            className="inline-flex h-8 w-full items-center justify-center rounded border border-amber-500/70 bg-amber-500/15 px-3 text-xs font-medium text-amber-200 hover:bg-amber-500/25"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
