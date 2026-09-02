import { useEffect } from 'react'
import { X } from 'lucide-react'
import UserAvatar, { displayName } from '@/components/UserAvatar'
import { useAccountStore } from '@/store/accountStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

function formatValidUntil(periodEnd: string): string {
  const date = new Date(periodEnd)
  if (Number.isNaN(date.getTime())) return periodEnd
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function GoogleMark() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.46a5.52 5.52 0 0 1-2.4 3.63v3h3.88c2.26-2.08 3.55-5.14 3.55-8.66Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.92l-3.88-3c-1.08.72-2.47 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.55.38-2.27V6.64H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.36l4-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.64l4 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}

export default function AccountDialog() {
  const open = useUiLayoutStore((s) => s.accountDialogOpen)
  const setOpen = useUiLayoutStore((s) => s.setAccountDialogOpen)
  const signedIn = useAccountStore((s) => s.signedIn)
  const user = useAccountStore((s) => s.user)
  const plan = useAccountStore((s) => s.plan)
  const periodEnd = useAccountStore((s) => s.periodEnd)
  const status = useAccountStore((s) => s.status)
  const error = useAccountStore((s) => s.error)
  const googleSignIn = useAccountStore((s) => s.googleSignIn)
  const logout = useAccountStore((s) => s.logout)

  useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const busy = status === 'loading'

  async function onGoogle(): Promise<void> {
    const ok = await googleSignIn()
    if (ok) setOpen(false)
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
        aria-labelledby="account-title"
        className="w-full max-w-[22rem] overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 id="account-title" className="text-sm font-semibold text-amber-400">
              {signedIn ? 'Account' : 'Sign in'}
            </h2>
            {!signedIn ? (
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Continue with Google. If you&apos;re new, we&apos;ll create your account.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="px-4 py-4">
          {signedIn && user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <UserAvatar user={user} size={40} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{displayName(user)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500">{user.email}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
                    {plan === 'pro' ? 'Pro' : 'Free'}
                  </p>
                  {plan === 'pro' && periodEnd ? (
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      Valid until {formatValidUntil(periodEnd)}
                    </p>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void logout()}
                className="inline-flex h-8 w-full items-center justify-center rounded border border-zinc-700 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onGoogle()}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <GoogleMark />
              {busy ? 'Waiting for Google…' : 'Continue with Google'}
            </button>
          )}

          {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
