import { useEffect } from 'react'
import { Calendar, Sparkles, Ticket, X } from 'lucide-react'
import EarlyAdapterBadge from '@/components/EarlyAdapterBadge'
import UserAvatar, { displayName } from '@/components/UserAvatar'
import { useAccountStore } from '@/store/accountStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import type { AccountUser, Plan } from '@shared/accountTypes'

const DAY_MS = 24 * 60 * 60 * 1000
const EXPIRING_SOON_DAYS = 14

type SubStatus = 'free' | 'active' | 'expiring' | 'expired'

function formatValidUntil(periodEnd: string): string {
  const date = new Date(periodEnd)
  if (Number.isNaN(date.getTime())) return periodEnd
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function remainingDays(periodEnd: string, now = Date.now()): number | null {
  const end = new Date(periodEnd).getTime()
  if (Number.isNaN(end)) return null
  return Math.max(0, Math.ceil((end - now) / DAY_MS))
}

function subscriptionStatus(plan: Plan | null, periodEnd: string | null): SubStatus {
  if (plan !== 'pro') return 'free'
  if (!periodEnd) return 'active'
  const days = remainingDays(periodEnd)
  if (days === null) return 'active'
  if (days <= 0) return 'expired'
  if (days <= EXPIRING_SOON_DAYS) return 'expiring'
  return 'active'
}

function daysLeftLabel(days: number): string {
  if (days <= 0) return 'Ended'
  if (days === 1) return '1 day left'
  return `${days} days left`
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
  const setRedeemDialogOpen = useUiLayoutStore((s) => s.setRedeemDialogOpen)
  const signedIn = useAccountStore((s) => s.signedIn)
  const user = useAccountStore((s) => s.user)
  const plan = useAccountStore((s) => s.plan)
  const periodEnd = useAccountStore((s) => s.periodEnd)
  const status = useAccountStore((s) => s.status)
  const error = useAccountStore((s) => s.error)
  const googleSignIn = useAccountStore((s) => s.googleSignIn)
  const logout = useAccountStore((s) => s.logout)
  const refresh = useAccountStore((s) => s.refresh)

  useEffect(() => {
    if (!open) return

    void refresh()

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen, refresh])

  if (!open) return null

  const busy = status === 'loading'

  async function onGoogle(): Promise<void> {
    const ok = await googleSignIn()
    if (ok) setOpen(false)
  }

  function onRedeem(): void {
    setOpen(false)
    setRedeemDialogOpen(true)
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
        className="relative w-full max-w-[24rem] overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-amber-500/[0.08] to-transparent"
          aria-hidden
        />

        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="absolute right-2.5 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="relative px-5 pb-5 pt-6">
          {signedIn && user ? (
            <SignedInAccount
              user={user}
              plan={plan}
              periodEnd={periodEnd}
              busy={busy}
              error={error}
              onRedeem={onRedeem}
              onLogout={() => void logout()}
            />
          ) : (
            <div>
              <h2 id="account-title" className="text-[15px] font-semibold tracking-tight text-zinc-100">
                Sign in
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
                Continue with Google. If you&apos;re new, we&apos;ll create your account.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onGoogle()}
                className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <GoogleMark />
                {busy ? 'Waiting for Google…' : 'Continue with Google'}
              </button>
              {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SignedInAccount({
  user,
  plan,
  periodEnd,
  busy,
  error,
  onRedeem,
  onLogout
}: {
  user: AccountUser
  plan: Plan | null
  periodEnd: string | null
  busy: boolean
  error: string | null
  onRedeem: () => void
  onLogout: () => void
}) {
  const subStatus = subscriptionStatus(plan, periodEnd)
  const days = periodEnd ? remainingDays(periodEnd) : null
  const showRedeem = subStatus === 'free' || subStatus === 'expired'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pr-6">
        <UserAvatar user={user} size={48} className="ring-1 ring-zinc-700/80" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2
              id="account-title"
              className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-zinc-100"
            >
              {displayName(user)}
            </h2>
            {user.earlyAdapter ? <EarlyAdapterBadge /> : null}
          </div>
          <p className="mt-0.5 truncate text-[12px] text-zinc-500">{user.email}</p>
        </div>
      </div>

      <SubscriptionCard
        status={subStatus}
        periodEnd={periodEnd}
        days={days}
        earlyAdapter={user.earlyAdapter}
      />

      {showRedeem ? (
        <button
          type="button"
          onClick={onRedeem}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200"
        >
          <Ticket className="h-3.5 w-3.5" aria-hidden />
          Redeem Early adapter code
        </button>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={onLogout}
        className="inline-flex h-8 w-full items-center justify-center rounded border border-zinc-700 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
      >
        Sign out
      </button>

      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  )
}

function SubscriptionCard({
  status,
  periodEnd,
  days,
  earlyAdapter
}: {
  status: SubStatus
  periodEnd: string | null
  days: number | null
  earlyAdapter: boolean
}) {
  const isPro = status !== 'free'
  const pill = statusPill(status)

  return (
    <section
      aria-label="Subscription"
      className={
        isPro
          ? 'rounded-lg border border-amber-500/25 bg-amber-950/20 px-3.5 py-3'
          : 'rounded-lg border border-zinc-800 bg-zinc-900/50 px-3.5 py-3'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Subscription
          </p>
          <p className={`mt-0.5 text-base font-semibold ${isPro ? 'text-amber-200' : 'text-zinc-100'}`}>
            {isPro ? 'Pro' : 'Free'}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${pill.className}`}
        >
          {pill.label}
        </span>
      </div>

      <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">{statusCopy(status, earlyAdapter)}</p>

      {earlyAdapter && isPro ? (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-300">
          <Sparkles className="h-3 w-3" aria-hidden />
          Early adapter access
        </p>
      ) : null}

      {isPro && periodEnd ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-zinc-800/80 pt-3">
          <div>
            <p className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
              <Calendar className="h-3 w-3" aria-hidden />
              {status === 'expired' ? 'Ended on' : 'Valid until'}
            </p>
            <p className="mt-0.5 text-sm font-medium tabular-nums text-zinc-100">
              {formatValidUntil(periodEnd)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Time left</p>
            <p
              className={`mt-0.5 text-sm font-medium tabular-nums ${
                status === 'expired'
                  ? 'text-red-300'
                  : status === 'expiring'
                    ? 'text-amber-300'
                    : 'text-zinc-100'
              }`}
            >
              {days == null ? 'Unknown' : daysLeftLabel(days)}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function statusPill(status: SubStatus): { label: string; className: string } {
  if (status === 'active') {
    return { label: 'Active', className: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30' }
  }
  if (status === 'expiring') {
    return { label: 'Expiring', className: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30' }
  }
  if (status === 'expired') {
    return { label: 'Expired', className: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30' }
  }
  return { label: 'Limited', className: 'bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700' }
}

function statusCopy(status: SubStatus, earlyAdapter: boolean): string {
  if (status === 'active') {
    return earlyAdapter
      ? 'Pro is active with founding-member access.'
      : 'Pro is active. Charts, replay, and Pro tools are unlocked.'
  }
  if (status === 'expiring') {
    return 'Pro expires soon. Use your remaining time on charts and replay.'
  }
  if (status === 'expired') {
    return 'Pro has ended. Redeem a code to restore access.'
  }
  return 'You are on the Free plan. Redeem a code to unlock Pro.'
}
