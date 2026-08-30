import { type ReactElement } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useSessionStore } from '@/store/sessionStore'
import { showToast } from '@/store/toastStore'

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** Guards session deletion, which is permanent and not undoable. */
export default function SessionDeleteConfirmDialog(): ReactElement | null {
  const pendingDeleteId = useSessionStore((s) => s.pendingDeleteId)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const sessions = useSessionStore((s) => s.sessions)
  const confirmPendingDelete = useSessionStore((s) => s.confirmPendingDelete)
  const cancelPendingDelete = useSessionStore((s) => s.cancelPendingDelete)

  const target = sessions.find((session) => session.id === pendingDeleteId) ?? null
  const wasActive = target != null && target.id === activeSessionId

  const contents: string[] = []
  if (target && target.drawings.length > 0) {
    contents.push(plural(target.drawings.length, 'drawing'))
  }
  const trades = target ? target.closedTrades.length + target.positions.length : 0
  if (trades > 0) contents.push(plural(trades, 'trade'))

  function handleConfirm(): void {
    // Read the name before the delete, since `target` disappears with it.
    const deleted = target?.name
    confirmPendingDelete()
    if (deleted == null) return
    showToast(
      'info',
      wasActive
        ? `Session “${deleted}” deleted. The chart no longer auto-saves.`
        : `Session “${deleted}” deleted.`
    )
  }

  return (
    <ConfirmDialog
      open={target != null}
      tone="danger"
      title="Delete session?"
      subtitle={target?.name}
      confirmLabel="Delete"
      cancelLabel="Keep"
      onConfirm={handleConfirm}
      onCancel={cancelPendingDelete}
    >
      <p>
        <span className="font-medium text-zinc-100">{target?.name}</span> will be deleted
        permanently. This cannot be undone.
      </p>
      {contents.length > 0 && <p className="text-red-400/90">It holds {contents.join(' and ')}.</p>}
      {wasActive && (
        <p className="text-red-400/90">
          It is the active session, so the chart will no longer auto-save.
        </p>
      )}
    </ConfirmDialog>
  )
}
