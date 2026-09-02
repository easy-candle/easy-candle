import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAccountStore } from '@/store/accountStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

const CODE_MASK = 'EC-XXXX-XXXX-XXXX'
const CODE_PATTERN = /^EC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/

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

export default function RedeemDialog() {
  const open = useUiLayoutStore((s) => s.redeemDialogOpen)
  const setOpen = useUiLayoutStore((s) => s.setRedeemDialogOpen)
  const redeemCode = useAccountStore((s) => s.redeemCode)

  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successPeriodEnd, setSuccessPeriodEnd] = useState<string | null>(null)

  const complete = CODE_PATTERN.test(code)

  useEffect(() => {
    if (!open) return

    setCode('')
    setBusy(false)
    setError(null)
    setSuccessPeriodEnd(null)

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
    setSuccessPeriodEnd(result.periodEnd)
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
        className="w-full max-w-[24rem] overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
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
          {successPeriodEnd ? (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">Pro</p>
              <p className="text-[11px] text-zinc-500">Valid until {formatValidUntil(successPeriodEnd)}</p>
            </div>
          ) : (
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
          )}

          {error ? <p className="mt-3 text-xs text-red-300">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
