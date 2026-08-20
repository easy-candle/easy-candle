import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Database, FileUp, Trash2, X } from 'lucide-react'
import IconButton from '@/components/IconButton'
import ImportConfirmModal, { type ImportConfirmDetails } from '@/components/ImportConfirmModal'
import { buildImportTimeframes } from '@shared/candleAggregate'
import { hasNewerCandles } from '@shared/importTypes'
import { parseMtCsv } from '@shared/mtCsvImport'
import type { Candle } from '@shared/candleUtils'
import type { ImportedDatasetMeta } from '@shared/importTypes'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { formatUtcCandleTime } from '@/lib/utcDateTime'

export type ImportFeedback = {
  tone: 'error' | 'info'
  message: string
}

type PendingImport = ImportConfirmDetails & {
  content: string
}

type ImportDataDialogProps = {
  onFeedback?: (feedback: ImportFeedback | null) => void
}

type InlineMessage = { tone: 'error' | 'info' | 'success'; message: string } | null

function normalizeSymbol(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export default function ImportDataDialog({ onFeedback }: ImportDataDialogProps): ReactNode {
  const mode = useReplayStore((s) => s.mode)
  const status = useReplayStore((s) => s.status)
  const dataSource = useReplayStore((s) => s.dataSource)
  const importMeta = useReplayStore((s) => s.importMeta)
  const importedList = useReplayStore((s) => s.importedList)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const activateImportedDataset = useReplayStore((s) => s.activateImportedDataset)
  const clearImportedDataset = useReplayStore((s) => s.clearImportedDataset)
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)
  const selectImportedDataset = useReplayStore((s) => s.selectImportedDataset)

  const open = useUiLayoutStore((s) => s.importDataDialogOpen)
  const setOpen = useUiLayoutStore((s) => s.setImportDataDialogOpen)

  const [busy, setBusy] = useState(false)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [message, setMessage] = useState<InlineMessage>(null)

  const disabled =
    mode === 'replay' || status === 'loading' || replayLoading || busy || pending != null

  const showBanner = useCallback(
    (tone: ImportFeedback['tone'], messageText: string): void => {
      onFeedback?.({ tone, message: messageText })
    },
    [onFeedback]
  )

  const showInline = useCallback(
    (tone: NonNullable<InlineMessage>['tone'], messageText: string): void => {
      setMessage({ tone, message: messageText })
    },
    []
  )

  useEffect(() => {
    if (!open) return
    void refreshImportedList()
  }, [open, refreshImportedList])

  useEffect(() => {
    if (!open) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !disabled) setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, disabled, setOpen])

  function openConfirm(params: {
    content: string
    fileName: string
    candles: Candle[]
    symbol: string | null
    symbolFromFilename: boolean
    warnings: string[]
    replaceId?: string
    existingSymbol?: string
  }): void {
    setMessage(null)
    setModalError(null)
    setPending({
      content: params.content,
      fileName: params.fileName,
      candles: params.candles,
      symbol: params.symbol,
      symbolFromFilename: params.symbolFromFilename,
      warnings: params.warnings,
      replaceId: params.replaceId,
      existingSymbol: params.existingSymbol
    })
  }

  async function prepareFromPath(path: string, fileName: string): Promise<void> {
    setBusy(true)
    setMessage(null)
    setModalError(null)

    try {
      const read = await window.api.readImportFile(path)
      if (!read.ok) {
        showInline('error', read.error)
        return
      }

      const parsed = parseMtCsv(read.content, fileName || read.fileName)
      if (!parsed.ok) {
        showInline('error', parsed.error)
        return
      }

      const symbolHint = parsed.symbol ? normalizeSymbol(parsed.symbol) : null
      let replaceId: string | undefined
      let existingSymbol: string | undefined

      if (symbolHint) {
        const listed = await window.api.listImports()
        if (listed.ok) {
          const existing = listed.imports.find(
            (entry) => normalizeSymbol(entry.symbol) === symbolHint
          )
          if (existing) {
            const loaded = await window.api.loadImport(existing.id, '1m')
            if (loaded.ok) {
              if (!hasNewerCandles(loaded.candles, parsed.candles)) {
                showInline(
                  'info',
                  `${existing.symbol} is already imported through ${formatUtcCandleTime(existing.lastTime)}. This file has no newer candles — nothing was updated.`
                )
                return
              }
              replaceId = existing.id
              existingSymbol = existing.symbol
            } else {
              replaceId = existing.id
              existingSymbol = existing.symbol
            }
          }
        }
      }

      openConfirm({
        content: read.content,
        fileName: fileName || read.fileName,
        candles: parsed.candles,
        symbol: parsed.symbol,
        symbolFromFilename: parsed.symbolFromFilename,
        warnings: parsed.warnings,
        replaceId,
        existingSymbol
      })
    } finally {
      setBusy(false)
    }
  }

  async function onImportNew(): Promise<void> {
    setMessage(null)
    setModalError(null)
    const dialog = await window.api.openImportDialog()
    if (!dialog.ok) {
      if (!dialog.canceled && dialog.error) showInline('error', dialog.error)
      return
    }
    await prepareFromPath(dialog.path, dialog.fileName)
  }

  async function onConfirmImport(values: { symbol: string }): Promise<void> {
    if (!pending) return
    setConfirmBusy(true)
    setModalError(null)
    setMessage(null)

    try {
      const symbol = normalizeSymbol(values.symbol)
      let replaceId = pending.replaceId

      // Symbol typed in the modal may match an existing import even when the file name did not.
      if (!replaceId) {
        const listed = await window.api.listImports()
        if (listed.ok) {
          const existing = listed.imports.find((entry) => normalizeSymbol(entry.symbol) === symbol)
          if (existing) {
            const loaded = await window.api.loadImport(existing.id, '1m')
            if (loaded.ok && !hasNewerCandles(loaded.candles, pending.candles)) {
              setModalError(
                `${existing.symbol} is already imported through ${formatUtcCandleTime(existing.lastTime)}. This file has no newer candles.`
              )
              return
            }
            replaceId = existing.id
          }
        }
      }

      const candlesByTimeframe = buildImportTimeframes(pending.candles)
      const savedResult = await window.api.saveImport({
        content: pending.content,
        originalFileName: pending.fileName,
        symbol,
        candlesByTimeframe,
        replaceId
      })

      if (!savedResult.ok) {
        setModalError(savedResult.error)
        return
      }

      // Activate on default display TF (15m when available).
      const activateTf = savedResult.meta.timeframe
      const series = candlesByTimeframe[activateTf] || pending.candles
      activateImportedDataset(series, { ...savedResult.meta, timeframe: activateTf })
      setPending(null)
      setModalError(null)
      setOpen(false)

      const last = formatUtcCandleTime(savedResult.meta.lastTime)
      if (savedResult.updated) {
        showBanner(
          'info',
          `Updated ${savedResult.meta.symbol}: new candles through ${last}. Built 5m · 15m · 1h · 4h · 1d.`
        )
      } else {
        showBanner(
          'info',
          `Imported ${savedResult.meta.symbol} (${savedResult.meta.candleCount.toLocaleString()} × 1m). Built 5m · 15m · 1h · 4h · 1d.`
        )
      }

      await refreshImportedList()
    } finally {
      setConfirmBusy(false)
    }
  }

  async function onDeleteSaved(id: string): Promise<void> {
    if (!id) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await window.api.deleteImport(id)
      if (!result.ok) {
        showInline('error', result.error)
        return
      }
      if (importMeta?.id === id) {
        clearImportedDataset()
      }
      await refreshImportedList()
      showInline('success', 'Imported symbol removed.')
    } finally {
      setBusy(false)
    }
  }

  async function onLoadDataset(entry: ImportedDatasetMeta): Promise<void> {
    setBusy(true)
    setMessage(null)
    try {
      await selectImportedDataset(entry.id, entry.timeframe)
      setOpen(false)
      showBanner(
        'info',
        `Loaded ${entry.symbol} (${entry.candleCount.toLocaleString()} × 1m · imported).`
      )
    } finally {
      setBusy(false)
    }
  }

  function onExitImported(): void {
    setMessage(null)
    clearImportedDataset()
    showInline('success', 'Exited imported mode.')
  }

  const messageClass =
    message?.tone === 'error'
      ? 'text-red-400'
      : message?.tone === 'success'
        ? 'text-emerald-400/90'
        : 'text-amber-400/90'

  return (
    <>
      <IconButton
        tooltip="Import data"
        dataTour="import-data"
        disabled={disabled}
        tone="accent"
        onClick={() => {
          setMessage(null)
          setModalError(null)
          setOpen(true)
        }}
        className="!w-auto gap-1.5 px-2.5"
      >
        <Database className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Import data</span>
      </IconButton>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
          role="presentation"
          onClick={() => {
            if (!disabled) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-data-title"
            className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
              <div>
                <h2 id="import-data-title" className="text-sm font-semibold text-amber-400">
                  Import data
                </h2>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Historical CSV datasets · MT4/MT5 1-minute
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={disabled}
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <section>
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  Import CSV
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => void onImportNew()}
                  className="mt-1.5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? (
                    <span>Reading…</span>
                  ) : (
                    <>
                      <FileUp className="h-4 w-4" aria-hidden />
                      Import MT4/MT5 1-minute CSV
                    </>
                  )}
                </button>
              </section>

              {dataSource === 'imported' && importMeta && (
                <section className="flex items-center justify-between gap-3 rounded border border-sky-900/50 bg-sky-950/30 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-sky-300">
                      {importMeta.symbol} · imported
                    </p>
                    <p
                      className="mt-0.5 truncate text-[11px] text-zinc-500"
                      title={`${importMeta.originalFileName} · ${formatUtcCandleTime(importMeta.firstTime)} → ${formatUtcCandleTime(importMeta.lastTime)}`}
                    >
                      {importMeta.originalFileName}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={onExitImported}
                    className="inline-flex h-8 shrink-0 items-center rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
                  >
                    Exit imported
                  </button>
                </section>
              )}

              <section>
                <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  Imported datasets
                </span>
                {importedList.length === 0 ? (
                  <p className="mt-1.5 text-xs text-zinc-600">
                    No imported datasets yet. Import a CSV to get started.
                  </p>
                ) : (
                  <ul className="mt-1.5 divide-y divide-zinc-800/80 rounded border border-zinc-800">
                    {importedList.map((entry) => {
                      const active = importMeta?.id === entry.id
                      return (
                        <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 text-xs font-medium text-zinc-100">
                              {entry.symbol}
                              {active && (
                                <span className="rounded-sm border border-sky-700/60 bg-sky-950/50 px-1 py-px text-[9px] uppercase tracking-wide text-sky-300">
                                  Active
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                              {entry.originalFileName} · {entry.candleCount.toLocaleString()} × 1m
                            </p>
                            <p className="text-[11px] text-zinc-600">
                              thru {formatUtcCandleTime(entry.lastTime)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              disabled={disabled || active}
                              onClick={() => void onLoadDataset(entry)}
                              className="inline-flex h-8 items-center rounded border border-zinc-700 bg-zinc-900/80 px-2.5 text-xs font-medium text-zinc-300 hover:border-amber-500/60 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {active ? 'Loaded' : 'Load'}
                            </button>
                            <IconButton
                              tooltip="Delete imported symbol"
                              disabled={disabled}
                              tone="danger"
                              onClick={() => void onDeleteSaved(entry.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              {message && (
                <p className={`text-[11px] leading-relaxed ${messageClass}`}>{message.message}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(false)}
                className="inline-flex h-8 items-center rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ImportConfirmModal
        details={pending}
        busy={confirmBusy}
        serverError={modalError}
        onCancel={() => {
          if (!confirmBusy) {
            setPending(null)
            setModalError(null)
          }
        }}
        onConfirm={(values) => void onConfirmImport(values)}
      />
    </>
  )
}
