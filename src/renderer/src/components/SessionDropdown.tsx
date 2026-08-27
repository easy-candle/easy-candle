import { useState, type FormEvent, type ReactElement } from 'react'
import { Check, FolderOpen, FolderPlus, LogOut, Save, Settings2, Trash2 } from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import { useSessionStore } from '@/store/sessionStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import Tooltip from '@/components/Tooltip'

export default function SessionDropdown(): ReactElement {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const createSession = useSessionStore((s) => s.createSession)
  const loadSession = useSessionStore((s) => s.loadSession)
  const deleteSession = useSessionStore((s) => s.deleteSession)
  const saveActiveSession = useSessionStore((s) => s.saveActiveSession)
  const setSessionAutoSave = useSessionStore((s) => s.setSessionAutoSave)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const setSessionManagerDialogOpen = useUiLayoutStore((s) => s.setSessionManagerDialogOpen)
  const [name, setName] = useState('')

  const active = sessions.find((session) => session.id === activeSessionId) ?? null

  function handleCreate(event: FormEvent): void {
    event.preventDefault()
    const id = createSession(name)
    if (id != null) setName('')
  }

  return (
    <Dropdown
      align="end"
      menuClassName="w-72"
      trigger={({ open, toggle }) => (
        <Tooltip text="Sessions" side="bottom">
          <button
            type="button"
            onClick={toggle}
            aria-label="Sessions"
            aria-expanded={open}
            data-tour="sessions"
            className={`inline-flex h-8 items-center gap-1.5 rounded border px-2 text-xs font-medium transition-colors ${
              open || active
                ? 'border-amber-500/70 bg-amber-950/40 text-amber-300'
                : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
            }`}
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
        </Tooltip>
      )}
    >
      {({ close }) => (
        <>
          <form
            onSubmit={handleCreate}
            className="flex items-center gap-1.5 border-b border-zinc-800 px-2 py-1.5"
          >
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New session name…"
              aria-label="New session name"
              className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-amber-500/70"
            />
            <button
              type="submit"
              aria-label="Create session"
              title="Create session from current drawings and orders"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-700 text-zinc-300 transition-colors hover:border-amber-500/70 hover:text-amber-300"
            >
              <FolderPlus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </form>

          {active && (
            <div className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-amber-300">
                  <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{active.name}</span>
                </span>
                <div className="flex gap-1">
                  <Tooltip text="Save now" side="top">
                    <button
                      type="button"
                      onClick={() => void saveActiveSession()}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-300 hover:bg-zinc-700/60 transition-colors hover:text-amber-300"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </Tooltip>
                  <Tooltip text="Exit session" side="top">
                    <button
                      type="button"
                      onClick={() => setActiveSession(null)}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-300 transition-colors hover:text-red-400 hover:bg-zinc-700/60"
                    >
                      <LogOut className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </Tooltip>
                </div>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="block truncate text-[10px] text-zinc-500">
                  {active.drawings.length} drawings ·{' '}
                  {active.closedTrades.length + active.positions.length} trades
                </span>
                <button
                  type="button"
                  aria-pressed={active.autoSave}
                  onClick={() => setSessionAutoSave(active.id, !active.autoSave)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors bg-zinc-800 ${
                    active.autoSave
                      ? 'text-amber-300'
                      : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${active.autoSave ? 'bg-amber-400' : 'bg-zinc-600'}`}
                  />
                  Auto-save
                </button>
              </div>
            </div>
          )}

          {sessions.length > 1 && active && <div className="my-1 h-px bg-zinc-800" />}

          {sessions.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-zinc-500">No sessions yet.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto px-1">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId
                return (
                  !isActive && (
                    <div
                      key={session.id}
                      className="group flex items-center gap-1 rounded px-1.5 py-1 hover:bg-zinc-800/60"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          loadSession(session.id)
                          close()
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 text-left"
                      >
                        {isActive ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                        ) : (
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-zinc-200 mb-1">
                            {session.name}
                          </span>
                          <span className="block truncate text-[10px] text-zinc-500">
                            {session.drawings.length} drawings ·{' '}
                            {session.closedTrades.length + session.positions.length} trades
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete session ${session.name}`}
                        onClick={() => deleteSession(session.id)}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  )
                )
              })}
            </div>
          )}

          <div className="my-1 h-px bg-zinc-800" />
          <button
            type="button"
            onClick={() => {
              setSessionManagerDialogOpen(true)
              close()
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100"
          >
            <Settings2 className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
            <span className="flex-1 font-medium">Manage sessions</span>
          </button>
        </>
      )}
    </Dropdown>
  )
}
