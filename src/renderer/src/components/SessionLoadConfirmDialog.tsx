import { type ReactElement } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog'
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

  const target = sessions.find((session) => session.id === pendingLoadId) ?? null

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
    <ConfirmDialog
      open={target != null}
      title="Load session?"
      subtitle={target?.name}
      confirmLabel="Load & discard"
      onConfirm={() => void confirmPendingLoad()}
      onCancel={cancelPendingLoad}
    >
      <p>
        The current chart is not saved to any session. Loading{' '}
        <span className="font-medium text-zinc-100">{target?.name}</span> replaces it.
      </p>
      {losing.length > 0 && (
        <p className="text-amber-400/90">You will lose {losing.join(' and ')} on the chart.</p>
      )}
      {work?.inReplay && <p className="text-amber-400/90">The current replay will be exited.</p>}
      <p className="text-[11px] text-zinc-500">
        To keep this work, cancel and save it as a new session first.
      </p>
    </ConfirmDialog>
  )
}
