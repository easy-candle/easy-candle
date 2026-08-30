import { useEffect, type ReactNode } from 'react'
import { TriangleAlert, X } from 'lucide-react'

type ConfirmDialogProps = {
  /** Rendered only when true; the caller owns the open state. */
  open: boolean
  title: string
  /** Secondary line under the title, e.g. the target's name. */
  subtitle?: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** danger = destructive red confirm; amber otherwise. */
  tone?: 'amber' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal shell for "are you sure" prompts: Escape, backdrop click, and a focused
 * confirm button. Body copy is the caller's job — it should say what is lost.
 */
export default function ConfirmDialog({
  open,
  title,
  subtitle,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'amber',
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onCancel()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const danger = tone === 'danger'
  const accent = danger ? 'text-red-400' : 'text-amber-400'
  const confirmClass = danger
    ? 'border-red-500/40 bg-red-950/40 text-red-300 hover:border-red-400/70 hover:text-red-200'
    : 'border-amber-500/40 bg-amber-950/40 text-amber-300 hover:border-amber-400/70 hover:text-amber-200'

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2">
            <TriangleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${accent}`} aria-hidden />
            <div className="min-w-0">
              <h2 id="confirm-dialog-title" className={`text-sm font-semibold ${accent}`}>
                {title}
              </h2>
              {subtitle && (
                <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={subtitle}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label={cancelLabel}
            onClick={onCancel}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-2 px-4 py-4 text-[12px] leading-relaxed text-zinc-300">
          {children}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 items-center rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`inline-flex h-8 items-center rounded border px-3 text-xs font-medium ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
