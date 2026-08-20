import { useEffect } from 'react'
import { ChartCandlestick } from 'lucide-react'
import { SYMBOLS } from '@shared/symbols'
import { useReplayStore } from '@/store/replayStore'

const CRYPTO_PREFIX = 'crypto:'
const IMPORT_PREFIX = 'import:'

export default function SymbolSelect() {
  const symbol = useReplayStore((s) => s.symbol)
  const status = useReplayStore((s) => s.status)
  const mode = useReplayStore((s) => s.mode)
  const dataSource = useReplayStore((s) => s.dataSource)
  const importMeta = useReplayStore((s) => s.importMeta)
  const importedList = useReplayStore((s) => s.importedList)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const setSymbol = useReplayStore((s) => s.setSymbol)
  const selectImportedDataset = useReplayStore((s) => s.selectImportedDataset)
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)

  const disabled = status === 'loading' || replayLoading || mode === 'replay'
  const imported = dataSource === 'imported'

  useEffect(() => {
    void refreshImportedList()
  }, [refreshImportedList])

  const selectValue = imported && importMeta ? `${IMPORT_PREFIX}${importMeta.id}` : `${CRYPTO_PREFIX}${symbol}`

  async function onChange(raw: string): Promise<void> {
    if (raw.startsWith(IMPORT_PREFIX)) {
      const id = raw.slice(IMPORT_PREFIX.length)
      if (!id) return
      await selectImportedDataset(id)
      return
    }

    if (raw.startsWith(CRYPTO_PREFIX)) {
      const next = raw.slice(CRYPTO_PREFIX.length)
      if (!next) return
      setSymbol(next)
    }
  }

  return (
    <label
      className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/80 px-2 text-xs text-zinc-400"
      data-tour="symbol"
    >
      <ChartCandlestick className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
      <span className="sr-only">Symbol</span>
      <select
        className="max-w-[10.5rem] rounded bg-zinc-900 text-zinc-100 outline-none disabled:opacity-60"
        value={selectValue}
        disabled={disabled}
        title={mode === 'replay' ? 'Exit replay to change symbol' : undefined}
        aria-label="Symbol"
        onChange={(event) => void onChange(event.target.value)}
      >
        {importedList.length > 0 && (
          <optgroup label="Imported" className="bg-zinc-900 text-zinc-100">
            {importedList.map((entry) => (
              <option
                key={entry.id}
                value={`${IMPORT_PREFIX}${entry.id}`}
                className="bg-zinc-900 text-zinc-100"
              >
                {entry.symbol}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Crypto" className="bg-zinc-900 text-zinc-100">
          {SYMBOLS.map((entry) => (
            <option
              key={entry.id}
              value={`${CRYPTO_PREFIX}${entry.binanceSymbol}`}
              className="bg-zinc-900 text-zinc-100"
            >
              {entry.label}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  )
}
