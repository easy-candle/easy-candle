import { useMemo, useState, type FormEvent, type ReactElement } from 'react'
import {
  Check,
  FolderOpen,
  FolderPlus,
  LogOut,
  PenLine,
  Save,
  Settings2,
  Trash2,
  TrendingUp
} from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import { useSessionStore, type Session } from '@/store/sessionStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { showToast } from '@/store/toastStore'
import { formatTimeAgo } from '@/lib/utcDateTime'
import Tooltip from '@/components/Tooltip'

function tradeCount(session: Session): number {
  return session.closedTrades.length + session.positions.length
}

/** Drawing / trade counts as icon + number pairs, so rows stay scannable. */
function SessionStats({ session }: { session: Session }): ReactElement {
  const drawings = session.drawings.length
  const trades = tradeCount(session)

  return (
    <span className="flex shrink-0 items-center gap-2 text-[10px] tabular-nums text-zinc-500">
      <span
        className="flex items-center gap-0.5"
        title={`${drawings} drawing${drawings === 1 ? '' : 's'}`}
      >
        <PenLine className="h-3 w-3" aria-hidden />
        {drawings}
      </span>
      <span
        className="flex items-center gap-0.5"
        title={`${trades} trade${trades === 1 ? '' : 's'}`}
      >
        <TrendingUp className="h-3 w-3" aria-hidden />
        {trades}
      </span>
    </span>
  )
}

/** Symbol · timeframe, or a dash when the session predates that capture. */
function SessionMarket({ session }: { session: Session }): ReactElement {
  const label = [session.symbol, session.timeframe].filter(Boolean).join(' · ')
  return (
    <span className="truncate text-[10px] text-zinc-500">
      {label || '—'}
      {session.mode === 'replay' && (
        <span className="ml-1 text-amber-400/70" title="Saved mid-replay">
          replay
        </span>
      )}
    </span>
  )
}

export default function SessionDropdown(): ReactElement {
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const createSession = useSessionStore((s) => s.createSession)
  const requestLoadSession = useSessionStore((s) => s.requestLoadSession)
  const requestDeleteSession = useSessionStore((s) => s.requestDeleteSession)
  const saveActiveSession = useSessionStore((s) => s.saveActiveSession)
  const setSessionAutoSave = useSessionStore((s) => s.setSessionAutoSave)
  const exitActiveSession = useSessionStore((s) => s.exitActiveSession)
  const setSessionManagerDialogOpen = useUiLayoutStore((s) => s.setSessionManagerDialogOpen)
  const [name, setName] = useState('')

  const active = sessions.find((session) => session.id === activeSessionId) ?? null
  // Most recently touched first — the ones worth reopening are at the top.
  const others = useMemo(
    () =>
      sessions
        .filter((session) => session.id !== activeSessionId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions, activeSessionId]
  )

  function handleCreate(event: FormEvent): void {
    event.preventDefault()
    const created = createSession(name)
    if (created == null) return
    setName('')
    showToast('success', `Session “${name.trim()}” created from the current chart.`)
  }

  /** Manual save is invisible otherwise — the row only shows a relative time. */
  function handleSave(): void {
    if (!active) return
    if (saveActiveSession()) {
      showToast('success', `Session “${active.name}” saved.`)
      return
    }
    showToast('error', `Could not save “${active.name}” — it no longer exists.`)
  }

  /** Exit wipes the chart, so say whether the work was written back first. */
  function handleExit(): void {
    if (!active) return
    const { name: exited, autoSave } = active
    exitActiveSession()
    showToast(
      autoSave ? 'success' : 'info',
      autoSave
        ? `Session “${exited}” saved and closed. The chart is now empty.`
        : `Session “${exited}” closed without saving — auto-save was off. The chart is now empty.`
    )
  }

  return (
    <Dropdown
      align="end"
      menuClassName="w-80"
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
            <Tooltip text="Create from current drawings and orders" side="bottom">
              <button
                type="submit"
                aria-label="Create session"
                disabled={name.trim().length === 0}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-700 text-zinc-300 transition-colors enabled:hover:border-amber-500/70 enabled:hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FolderPlus className="h-3.5 w-3.5" aria-hidden />
              </button>
            </Tooltip>
          </form>

          {active && (
            <div className="border-b border-zinc-800 bg-amber-950/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                <span
                  className="min-w-0 flex-1 truncate text-xs font-medium text-amber-300"
                  title={active.name}
                >
                  {active.name}
                </span>
                <div className="flex shrink-0 gap-0.5">
                  <Tooltip text="Save now" side="top">
                    <button
                      type="button"
                      aria-label="Save session now"
                      onClick={handleSave}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-300 transition-colors hover:bg-zinc-700/60 hover:text-amber-300"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </Tooltip>
                  <Tooltip text="Exit session — clears the chart" side="top">
                    <button
                      type="button"
                      aria-label="Exit session"
                      onClick={() => {
                        handleExit()
                        close()
                      }}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-300 transition-colors hover:bg-zinc-700/60 hover:text-red-400"
                    >
                      <LogOut className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </Tooltip>
                </div>
              </div>

              <div className="flex items-center gap-2 pl-[1.375rem]">
                <SessionMarket session={active} />
                <SessionStats session={active} />
                <Tooltip
                  text={
                    active.autoSave
                      ? 'Auto-save on — chart edits are written back'
                      : 'Auto-save off — save manually'
                  }
                  side="top"
                >
                  <button
                    type="button"
                    aria-pressed={active.autoSave}
                    onClick={() => setSessionAutoSave(active.id, !active.autoSave)}
                    className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                      active.autoSave
                        ? 'text-amber-300'
                        : 'text-zinc-500 hover:bg-zinc-700/60 hover:text-zinc-300'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        active.autoSave ? 'bg-amber-400' : 'bg-zinc-600'
                      }`}
                      aria-hidden
                    />
                    Auto-save
                  </button>
                </Tooltip>
              </div>
            </div>
          )}

          {others.length === 0 ? (
            <p className="px-3 py-3 text-center text-[11px] text-zinc-500">
              {sessions.length === 0
                ? 'No sessions yet. Name one above to save the current chart.'
                : 'No other sessions.'}
            </p>
          ) : (
            <>
              <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                Saved
              </p>
              <div className="max-h-64 overflow-y-auto px-1 pb-1">
                {others.map((session) => (
                  <div
                    key={session.id}
                    className="group flex items-center gap-1 rounded px-1.5 py-1 transition-colors hover:bg-zinc-800/60"
                  >
                    <button
                      type="button"
                      title={`Load ${session.name}`}
                      onClick={() => {
                        void requestLoadSession(session.id)
                        close()
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 text-left"
                    >
                      <FolderOpen
                        className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-colors group-hover:text-amber-300"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-200">
                            {session.name}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-zinc-600">
                            {formatTimeAgo(session.updatedAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <SessionMarket session={session} />
                          <SessionStats session={session} />
                        </span>
                      </span>
                    </button>
                    <Tooltip text="Delete session" side="left">
                      <button
                        type="button"
                        aria-label={`Delete session ${session.name}`}
                        onClick={() => {
                          requestDeleteSession(session.id)
                          close()
                        }}
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-700/60 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="h-px bg-zinc-800" />
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
