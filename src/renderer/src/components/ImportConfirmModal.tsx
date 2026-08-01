import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Candle } from '@shared/candleUtils'
import { TIMEFRAME_IDS, TIMEFRAMES } from '@shared/timeframes'
import { formatUtcCandleTime } from '@/lib/utcDateTime'

export type ImportConfirmDetails = {
  fileName: string
  symbol: string | null
  timeframe: string | null
  inferredTimeframe: string
  symbolFromFilename: boolean
  timeframeFromFilename: boolean
  candles: Candle[]
  warnings: string[]
}

type ImportConfirmModalProps = {
  details: ImportConfirmDetails | null
  busy?: boolean
  serverError?: string | null
  onConfirm: (values: { symbol: string; timeframe: string }) => void
  onCancel: () => void
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export default function ImportConfirmModal({
  details,
  busy = false,
  serverError = null,
  onConfirm,
  onCancel
}: ImportConfirmModalProps) {
  const [symbol, setSymbol] = useState('')
  const [timeframe, setTimeframe] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!details) return
    setSymbol(details.symbol ?? '')
    setTimeframe(details.timeframe ?? details.inferredTimeframe ?? '')
    setFormError(null)
  }, [details])

  useEffect(() => {
    if (!details) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busy) onCancel()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [details, busy, onCancel])

  if (!details) return null

  const first = details.candles[0]
  const last = details.candles[details.candles.length - 1]
  const needSymbol = !details.symbolFromFilename
  const needTimeframe = !details.timeframeFromFilename

  function submit(): void {
    const nextSymbol = normalizeSymbol(symbol)
    const nextTimeframe = String(timeframe || '').trim()

    if (!nextSymbol) {
      setFormError('Symbol is required.')
      return
    }
    if (nextSymbol.length < 3) {
      setFormError('Enter a valid symbol (e.g. XAUUSD).')
      return
    }
    if (!nextTimeframe || !TIMEFRAMES[nextTimeframe]) {
      setFormError('Timeframe is required.')
      return
    }

    setFormError(null)
    onConfirm({ symbol: nextSymbol, timeframe: nextTimeframe })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-confirm-title"
        className="w-full max-w-md overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 id="import-confirm-title" className="text-sm font-semibold text-amber-400">
              Confirm import
            </h2>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={details.fileName}>
              {details.fileName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cancel import"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Symbol{needSymbol ? ' *' : ''}
              </span>
              {needSymbol ? (
                <input
                  type="text"
                  value={symbol}
                  disabled={busy}
                  autoFocus
                  placeholder="e.g. XAUUSD"
                  aria-label="Symbol"
                  onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                  className="mt-1 h-8 w-full rounded border border-zinc-700 bg-zinc-900 px-2 font-medium text-zinc-100 outline-none focus:border-amber-500/60 disabled:opacity-40"
                />
              ) : (
                <span className="mt-1 block font-medium text-zinc-100">{details.symbol}</span>
              )}
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Timeframe{needTimeframe ? ' *' : ''}
              </span>
              {needTimeframe ? (
                <select
                  value={timeframe}
                  disabled={busy}
                  aria-label="Timeframe"
                  onChange={(event) => setTimeframe(event.target.value)}
                  className="mt-1 h-8 w-full rounded border border-zinc-700 bg-zinc-900 px-2 font-medium text-zinc-100 outline-none focus:border-amber-500/60 disabled:opacity-40"
                >
                  {!timeframe && (
                    <option value="" className="bg-zinc-900">
                      Select…
                    </option>
                  )}
                  {TIMEFRAME_IDS.map((id) => (
                    <option key={id} value={id} className="bg-zinc-900 text-zinc-100">
                      {TIMEFRAMES[id].label}
                      {id === details.inferredTimeframe ? ' (from file)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="mt-1 block font-medium text-zinc-100">{details.timeframe}</span>
              )}
            </label>

            <div className="col-span-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Start (UTC)
              </span>
              <p className="mt-0.5 tabular-nums text-zinc-200">
                {formatUtcCandleTime(first?.time) || '—'}
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">End (UTC)</span>
              <p className="mt-0.5 tabular-nums text-zinc-200">
                {formatUtcCandleTime(last?.time) || '—'}
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Candles</span>
              <p className="mt-0.5 tabular-nums text-zinc-200">
                {details.candles.length.toLocaleString()}
              </p>
            </div>
          </div>

          {details.warnings.length > 0 && (
            <p className="text-[11px] leading-relaxed text-amber-400/90">
              {details.warnings.join(' ')}
            </p>
          )}
          {(formError || serverError) && (
            <p className="text-[11px] leading-relaxed text-red-400">{formError || serverError}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex h-8 items-center rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="inline-flex h-8 items-center rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200 disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Confirm & load'}
          </button>
        </div>
      </div>
    </div>
  )
}
