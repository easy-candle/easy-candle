import { useEffect, type ReactElement } from 'react'
import { TriangleAlert, X } from 'lucide-react'
import { describeUnsavedWork, useSessionStore } from '@/store/sessionStore'
import { useReplayStore } from '@/store/replayStore'

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/**
 * Guards a session load that would discard unsaved chart work. Only reachable
 * when no session is active — with one active the work is already saved.
 */
export default function SessionLoadConfirmDialog(): ReactElement | null {
  const pendingLoadId = useSessionStore((s) => s.pendingLoadId)
  const sessions = useSessionStore((s) => s.sessions)
  const confirmPendingLoad = useSessionStore((s) => s.confirmPendingLoad)
  const cancelPendingLoad = useSessionStore((s) => s.cancelPendingLoad)
  const drawings = useReplayStore((s) => s.drawings)
  const positions = useReplayStore((s) => s.positions)
  const pendingOrders = useReplayStore((s) => s.pendingOrders)
  const closedTrades = useReplayStore((s) => s.closedTrades)
  const orderHistory = useReplayStore((s) => s.orderHistory)
  const mode = useReplayStore((s) => s.mode)

  useEffect(() => {
    if (pendingLoadId == null) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') cancelPendingLoad()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pendingLoadId, cancelPendingLoad])

  if (pendingLoadId == null) return null

  const target = sessions.find((session) => session.id === pendingLoadId)
  if (!target) return null

  const work = describeUnsavedWork({
    drawings,
    positions,
    pendingOrders,
    closedTrades,
    orderHistory,
    mode
  })

  const losing: string[] = []
  if (work && work.drawings > 0) losing.push(plural(work.drawings, 'drawing'))
  if (work && work.trades > 0) losing.push(plural(work.trades, 'order'))

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={cancelPendingLoad}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-load-confirm-title"
        className="w-full max-w-md overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            <div className="min-w-0">
              <h2 id="session-load-confirm-title" className="text-sm font-semibold text-amber-400">
                Load session?
              </h2>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={target.name}>
                {target.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cancel"
            onClick={cancelPendingLoad}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-2 px-4 py-4 text-[12px] leading-relaxed text-zinc-300">
          <p>
            The current chart is not saved to any session. Loading{' '}
            <span className="font-medium text-zinc-100">{target.name}</span> replaces it.
          </p>
          {losing.length > 0 && (
            <p className="text-amber-400/90">You will lose {losing.join(' and ')} on the chart.</p>
          )}
          {work?.inReplay && (
            <p className="text-amber-400/90">The current replay will be exited.</p>
          )}
          <p className="text-[11px] text-zinc-500">
            To keep this work, cancel and save it as a new session first.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={cancelPendingLoad}
            className="inline-flex h-8 items-center rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => void confirmPendingLoad()}
            className="inline-flex h-8 items-center rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200"
          >
            Load &amp; discard
          </button>
        </div>
      </div>
    </div>
  )
}
