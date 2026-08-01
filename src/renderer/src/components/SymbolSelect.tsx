import { ChartCandlestick } from 'lucide-react'
import { SYMBOLS } from '@shared/symbols'
import { useReplayStore } from '@/store/replayStore'

export default function SymbolSelect() {
  const symbol = useReplayStore((s) => s.symbol)
  const status = useReplayStore((s) => s.status)
  const mode = useReplayStore((s) => s.mode)
  const dataSource = useReplayStore((s) => s.dataSource)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const setSymbol = useReplayStore((s) => s.setSymbol)
  const imported = dataSource === 'imported'
  // Symbol is fixed for the duration of a replay session or imported dataset.
  const disabled = status === 'loading' || replayLoading || mode === 'replay' || imported
  const known = SYMBOLS.some((entry) => entry.binanceSymbol === symbol)

  return (
    <label className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/80 px-2 text-xs text-zinc-400">
      <ChartCandlestick className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
      <span className="sr-only">Symbol</span>
      <select
        className="rounded bg-zinc-900 text-zinc-100 outline-none disabled:opacity-60"
        value={symbol}
        disabled={disabled}
        title={
          imported
            ? 'Symbol comes from the imported file name'
            : mode === 'replay'
              ? 'Exit replay to change symbol'
              : undefined
        }
        aria-label="Symbol"
        onChange={(event) => setSymbol(event.target.value)}
      >
        {imported && !known && (
          <option value={symbol} className="bg-zinc-900 text-zinc-100">
            {symbol}
          </option>
        )}
        {SYMBOLS.map((entry) => (
          <option key={entry.id} value={entry.binanceSymbol} className="bg-zinc-900 text-zinc-100">
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  )
}
