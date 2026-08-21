import { useEffect, useState, type ReactElement } from 'react'
import { BarChart3, Check, FolderOpen, FolderPlus, Pencil, Trash2, X } from 'lucide-react'
import { useSessionStore } from '@/store/sessionStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { summarizeSession } from '@/lib/paperTrade'

export default function SessionManagerDialog(): ReactElement | null {
  const open = useUiLayoutStore((s) => s.sessionManagerDialogOpen)
  const setOpen = useUiLayoutStore((s) => s.setSessionManagerDialogOpen)
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const createSession = useSessionStore((s) => s.createSession)
  const renameSession = useSessionStore((s) => s.renameSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const loadSession = useSessionStore((s) => s.loadSession)
  const setSessionAutoSave = useSessionStore((s) => s.setSessionAutoSave)
  const setPreviewSessionReport = useUiLayoutStore((s) => s.setPreviewSessionReport)

  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [prevOpen, setPrevOpen] = useState(false)

  if (open && !prevOpen) {
    setPrevOpen(true)
    setName('')
    setEditingId(null)
    setEditingName('')
  } else if (!open && prevOpen) {
    setPrevOpen(false)
  }

  useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  function handleCreate(event: React.FormEvent): void {
    event.preventDefault()
    const id = createSession(name)
    if (id != null) setName('')
  }

  function handleRenameSubmit(event: React.FormEvent, sessionId: string): void {
    event.preventDefault()
    renameSession(sessionId, editingName)
    setEditingId(null)
    setEditingName('')
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-manager-title"
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-lg flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 id="session-manager-title" className="text-sm font-semibold text-amber-400">
              Session Manager
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {sessions.length} session{sessions.length === 1 ? '' : 's'} saved
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <form
          onSubmit={handleCreate}
          className="flex items-center gap-1.5 border-b border-zinc-800 px-4 py-2.5"
        >
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New session name…"
            aria-label="New session name"
            className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-500/70"
          />
          <button
            type="submit"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-zinc-700 px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:border-amber-500/70 hover:text-amber-300"
          >
            <FolderPlus className="h-3.5 w-3.5" aria-hidden />
            Create
          </button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {sessions.length === 0 ? (
            <p className="py-4 text-center text-xs text-zinc-500">
              No sessions yet. Create one to save the current drawings and orders.
            </p>
          ) : (
            <ul className="space-y-1">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId
                const editing = editingId === session.id
                return (
                  <li
                    key={session.id}
                    className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                      isActive
                        ? 'border-amber-500/40 bg-amber-950/20'
                        : 'border-zinc-800 bg-zinc-900/40'
                    }`}
                  >
                    {editing ? (
                      <form
                        onSubmit={(event) => handleRenameSubmit(event, session.id)}
                        className="flex min-w-0 flex-1 items-center gap-1"
                      >
                        <input
                          type="text"
                          autoFocus
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          aria-label={`Rename ${session.name}`}
                          className="min-w-0 flex-1 rounded border border-amber-500/60 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 outline-none"
                        />
                        <button
                          type="submit"
                          aria-label="Save name"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-300 hover:text-amber-300"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel rename"
                          onClick={() => setEditingId(null)}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-100"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => loadSession(session.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 text-left"
                        >
                          {isActive ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                          ) : (
                            <FolderOpen
                              className="h-3.5 w-3.5 shrink-0 text-zinc-500"
                              aria-hidden
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-zinc-200">
                              {session.name}
                            </span>
                            <span className="block truncate text-[10px] text-zinc-500">
                              {session.symbol || '—'} · {session.timeframe || '—'} ·{' '}
                              {session.drawings.length} drawings ·{' '}
                              {session.closedTrades.length + (session.position ? 1 : 0)} trades
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Rename ${session.name}`}
                          onClick={() => {
                            setEditingId(session.id)
                            setEditingName(session.name)
                          }}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:text-zinc-100"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`View report for ${session.name}`}
                          title="View session report"
                          onClick={() => {
                            setPreviewSessionReport({
                              symbol: session.symbol,
                              timeframe: session.timeframe,
                              trades: session.closedTrades,
                              summary: summarizeSession(session.closedTrades),
                              closedOpenOnExit: false
                            })
                          }}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:text-amber-300"
                        >
                          <BarChart3 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${session.name}`}
                          onClick={() => deleteSession(session.id)}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-zinc-800 px-4 py-2.5 text-[11px] text-zinc-500">
          Each session keeps its drawings and paper-trade orders. Click a session to load it;
          auto-save keeps it in sync with your edits.
        </div>
      </div>
    </div>
  )
}
