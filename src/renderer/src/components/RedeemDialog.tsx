import { useEffect, useState } from 'react'
import { Check, PartyPopper, Sparkles, X } from 'lucide-react'
import EarlyAdapterBadge from '@/components/EarlyAdapterBadge'
import UserAvatar, { displayName } from '@/components/UserAvatar'
import { useAccountStore } from '@/store/accountStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import type { AccountUser } from '@shared/accountTypes'

const CODE_MASK = 'EC-XXXX-XXXX-XXXX'
const CODE_PATTERN = /^EC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/

type RedeemSuccess = {
  periodEnd: string
  expireDays: 365 | 186 | 90
}

function payloadFromRaw(raw: string): string {
  const alnum = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (alnum === 'E') return ''
  if (alnum.startsWith('EC')) return alnum.slice(2, 14)
  return alnum.slice(0, 12)
}

function formatPayload(payload: string): string {
  if (!payload) return ''
  const a = payload.slice(0, 4)
  const b = payload.slice(4, 8)
  const c = payload.slice(8, 12)
  let out = `EC-${a}`
  if (payload.length >= 4) out += '-'
  if (payload.length > 4) out += b
  if (payload.length >= 8) out += '-'
  if (payload.length > 8) out += c
  return out
}

function formatValidUntil(periodEnd: string): string {
  const date = new Date(periodEnd)
  if (Number.isNaN(date.getTime())) return periodEnd
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function durationLabel(days: 365 | 186 | 90): string {
  if (days === 365) return 'A full year of Pro'
  if (days === 186) return '6 months of Pro'
  return '90 days of Pro'
}

function greetingName(name: string): string {
  return name.split(/\s+/)[0] || name
}

export default function RedeemDialog() {
  const open = useUiLayoutStore((s) => s.redeemDialogOpen)
  const setOpen = useUiLayoutStore((s) => s.setRedeemDialogOpen)
  const redeemCode = useAccountStore((s) => s.redeemCode)
  const user = useAccountStore((s) => s.user)

  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<RedeemSuccess | null>(null)

  const complete = CODE_PATTERN.test(code)

  useEffect(() => {
    if (!open) return

    setCode('')
    setBusy(false)
    setError(null)
    setSuccess(null)

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  async function onRedeem(): Promise<void> {
    if (busy) return
    if (!complete) {
      setError('Invalid code.')
      return
    }
    setBusy(true)
    setError(null)
    const result = await redeemCode(code)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSuccess({ periodEnd: result.periodEnd, expireDays: result.expireDays })
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
        aria-labelledby="redeem-title"
        className={`relative w-full overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50 ${
          success ? 'max-w-[26rem]' : 'max-w-[24rem]'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        {success ? (
          <RedeemSuccessView
            user={user}
            success={success}
            onClose={() => setOpen(false)}
          />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
              <div>
                <h2 id="redeem-title" className="text-sm font-semibold text-amber-400">
                  Early Adapters Redeem
                </h2>
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
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void onRedeem()
                }}
              >
                <div className="relative">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 flex items-center px-2.5 font-mono text-sm tracking-[0.18em]"
                  >
                    <span className="text-zinc-100">{code}</span>
                    <span className="text-zinc-600">{CODE_MASK.slice(code.length)}</span>
                  </div>
                  <input
                    type="text"
                    value={code}
                    disabled={busy}
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="text"
                    aria-label="Redeem code"
                    placeholder={CODE_MASK}
                    onChange={(event) => {
                      setCode(formatPayload(payloadFromRaw(event.target.value)))
                      if (error) setError(null)
                    }}
                    className="h-9 w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 font-mono text-sm tracking-[0.18em] text-transparent caret-amber-400 outline-none placeholder:text-transparent focus:border-amber-500/60 disabled:opacity-40"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !complete}
                  className="inline-flex h-9 w-full items-center justify-center rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? 'Redeeming…' : 'Redeem'}
                </button>
              </form>

              {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function RedeemSuccessView({
  user,
  success,
  onClose
}: {
  user: AccountUser | null
  success: RedeemSuccess
  onClose: () => void
}) {
  const name = user ? displayName(user) : 'trader'
  const first = greetingName(name)
  const perks = [
    `${durationLabel(success.expireDays)}: charts, replay, and every Pro tool`,
    'Early adapter tag now sits next to your name',
    'Founding-member access as EasyCandle grows'
  ]

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-amber-500/[0.14] via-sky-500/[0.06] to-transparent"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute left-7 top-5 h-1 w-1 rounded-full bg-amber-300 animate-ping"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute right-12 top-8 h-1.5 w-1.5 rounded-full bg-sky-300 animate-pulse"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute left-16 top-14 h-1 w-1 rounded-full bg-amber-200/80"
        aria-hidden
      />

      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-2.5 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <div className="relative px-5 pb-5 pt-7">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3">
            <div
              className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-amber-400/50 via-sky-400/30 to-amber-600/20 blur-[2px]"
              aria-hidden
            />
            {user ? (
              <UserAvatar user={user} size={56} className="relative ring-2 ring-amber-400/40" />
            ) : (
              <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-800/90 text-amber-50 ring-2 ring-amber-400/40">
                <PartyPopper className="h-6 w-6" aria-hidden />
              </span>
            )}
            <span className="absolute -bottom-1 -right-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-400/50 bg-zinc-950 text-amber-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>

          <div className="flex max-w-full items-center justify-center gap-1.5 px-2">
            <p className="min-w-0 truncate text-sm font-semibold text-zinc-100">{name}</p>
            <EarlyAdapterBadge />
          </div>

          <h2 id="redeem-title" className="mt-3 text-lg font-semibold tracking-tight text-zinc-50">
            You&apos;re in, {first}
          </h2>
          <p className="mt-1.5 max-w-[20rem] text-[13px] leading-relaxed text-zinc-400">
            Congratulations. You just unlocked Pro and earned the Early adapter tag. Only founding
            traders get this mark next to their name.
          </p>
        </div>

        <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-950/25 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                Pro unlocked
              </p>
              <p className="mt-0.5 text-sm font-medium text-zinc-100">
                {durationLabel(success.expireDays)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Valid until</p>
              <p className="mt-0.5 text-sm font-medium text-zinc-200">
                {formatValidUntil(success.periodEnd)}
              </p>
            </div>
          </div>
        </div>

        <ul className="mt-3.5 space-y-2">
          {perks.map((perk) => (
            <li key={perk} className="flex items-start gap-2 text-[12px] leading-snug text-zinc-300">
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <Check className="h-2.5 w-2.5" aria-hidden />
              </span>
              {perk}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 inline-flex h-9 w-full items-center justify-center rounded border border-amber-500/50 bg-amber-500/15 px-3 text-xs font-medium text-amber-200 hover:bg-amber-500/25"
        >
          Start trading
        </button>
      </div>
    </div>
  )
}
