import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Cable, Database, ExternalLink, FileUp, Replace, Trash2, X } from 'lucide-react'
import IconButton from '@/components/IconButton'
import ImportConfirmModal, { type ImportConfirmDetails } from '@/components/ImportConfirmModal'
import {
  hasNewerCandles,
  isMetatraderImport,
  type ImportOrigin,
  type ImportedDatasetMeta
} from '@shared/importTypes'
import { IMPORT_BUILD_UI_PERCENT, type ImportJobProgress } from '@shared/importJobProgress'
import { MIN_1M_CANDLES_FOR_IMPORT, minImportCandlesMessage } from '@shared/importConstants'
import { yieldToEventLoop } from '@shared/yieldToEventLoop'
import { MT_BRIDGE_WS_URL } from '@shared/mtBridgeProtocol'
import type { Candle } from '@shared/candleUtils'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { isDesktopRuntime } from '@/lib/runtime'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import ImportProgressBar, { type ImportProgress } from '@/components/ImportProgressBar'

const EA_DOWNLOAD_URL =
  'https://github.com/easy-candle/easy-candle-ea/releases/latest/download/EasyCandleBridge.ex5'

export type ImportFeedback = {
  tone: 'error' | 'info'
  message: string
}

type PendingImport = ImportConfirmDetails & {
  content: string
  origin: ImportOrigin
  skipMessage?: string
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

function parseProgressLabel(progress: ImportJobProgress): string {
  if (progress.job === 'parse') {
    if (progress.phase === 'preparing') return 'Preparing file…'
    if (progress.phase === 'parsing') {
      if (progress.totalRows && progress.totalRows > 0) {
        return `Parsing candles… ${(progress.processedRows ?? 0).toLocaleString()} / ${progress.totalRows.toLocaleString()}`
      }
      return 'Parsing candles…'
    }
    return 'Validating candles…'
  }
  if (progress.job === 'save') return 'Saving…'
  return progress.phase
}

function statsFromCandles(candles: Candle[]): {
  candleCount: number
  firstTime: number
  lastTime: number
} {
  return {
    candleCount: candles.length,
    firstTime: candles[0]?.time ?? 0,
    lastTime: candles[candles.length - 1]?.time ?? 0
  }
}

export default function ImportDataDialog({ onFeedback }: ImportDataDialogProps): ReactNode {
  const mode = useReplayStore((s) => s.mode)
  const status = useReplayStore((s) => s.status)
  const dataSource = useReplayStore((s) => s.dataSource)
  const importMeta = useReplayStore((s) => s.importMeta)
  const importedList = useReplayStore((s) => s.importedList)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const clearImportedDataset = useReplayStore((s) => s.clearImportedDataset)
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)
  const selectImportedDataset = useReplayStore((s) => s.selectImportedDataset)
  const mtBridge = useReplayStore((s) => s.mtBridge)
  const mtPreview = useReplayStore((s) => s.mtPreview)
  const desktop = isDesktopRuntime()

  const open = useUiLayoutStore((s) => s.importDataDialogOpen)
  const setOpen = useUiLayoutStore((s) => s.setImportDataDialogOpen)

  const [busy, setBusy] = useState(false)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [loadProgress, setLoadProgress] = useState<ImportProgress | null>(null)
  const [confirmProgress, setConfirmProgress] = useState<ImportProgress | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [staleOffer, setStaleOffer] = useState<PendingImport | null>(null)
  const [message, setMessage] = useState<InlineMessage>(null)
  const [previewFresh, setPreviewFresh] = useState(false)

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

  const closeDialog = useCallback((): void => {
    if (disabled) return
    const staleToken = staleOffer?.parseToken
    if (staleToken) {
      void window.api.discardImportParse(staleToken)
    }
    setMessage(null)
    setModalError(null)
    setStaleOffer(null)
    setPending(null)
    setOpen(false)
  }, [disabled, setOpen, staleOffer])

  useEffect(() => {
    if (!open) return
    void refreshImportedList()
  }, [open, refreshImportedList])

  useEffect(() => {
    if (!open) return undefined

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !disabled) closeDialog()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, disabled, closeDialog])

  useEffect(() => {
    if (!open || !mtPreview) return
    setPreviewFresh(true)
    const timer = window.setTimeout(() => setPreviewFresh(false), 1600)
    return () => window.clearTimeout(timer)
  }, [open, mtPreview?.candleCount, mtPreview?.lastTime])

  async function findReplaceTarget(
    symbolHint: string,
    incomingLastTime: number
  ): Promise<{ replaceId?: string; existingSymbol?: string; skip?: string }> {
    const listed = await window.api.listImports()
    if (!listed.ok) return {}
    const existing = listed.imports.find((entry) => normalizeSymbol(entry.symbol) === symbolHint)
    if (!existing) return {}
    const target = { replaceId: existing.id, existingSymbol: existing.symbol }
    const incoming = [{ time: incomingLastTime, open: 0, high: 0, low: 0, close: 0 }]
    const existingLast = [{ time: existing.lastTime, open: 0, high: 0, low: 0, close: 0 }]
    if (!hasNewerCandles(existingLast, incoming)) {
      return {
        ...target,
        skip: `${existing.symbol} is already imported through ${formatUtcCandleTime(existing.lastTime)}. This has no newer candles — nothing was updated.`
      }
    }
    return target
  }

  function openConfirm(params: PendingImport): void {
    setMessage(null)
    setModalError(null)
    setStaleOffer(null)
    setPending(params)
  }

  function offerStaleReplace(params: PendingImport, skipMessage: string): void {
    setStaleOffer({ ...params, noNewer: true, skipMessage })
    showInline('info', skipMessage)
  }

  async function prepareFromPath(path: string, fileName: string): Promise<void> {
    setBusy(true)
    setMessage(null)
    setModalError(null)
    setLoadProgress({ label: 'Reading file…', percent: 2 })
    await yieldToEventLoop()

    const unsub = window.api.onImportJobProgress((progress) => {
      if (progress.job !== 'parse') return
      setLoadProgress({ label: parseProgressLabel(progress), percent: progress.percent })
    })

    try {
      const parsed = await window.api.parseImportFile(path)
      if (!parsed.ok) {
        showInline('error', parsed.error)
        return
      }

      setLoadProgress({ label: 'Checking existing imports…', percent: 98 })
      const symbolHint = parsed.symbol ? normalizeSymbol(parsed.symbol) : null
      const next: PendingImport = {
        content: '',
        fileName: fileName || path,
        candles: parsed.candles,
        candleCount: parsed.candleCount,
        firstTime: parsed.firstTime,
        lastTime: parsed.lastTime,
        parseToken: parsed.parseToken,
        symbol: parsed.symbol,
        symbolFromFilename: parsed.symbolFromFilename,
        warnings: parsed.warnings,
        origin: 'csv'
      }

      if (symbolHint) {
        const match = await findReplaceTarget(symbolHint, parsed.lastTime)
        next.replaceId = match.replaceId
        next.existingSymbol = match.existingSymbol
        if (match.skip && match.replaceId) {
          offerStaleReplace(next, match.skip)
          return
        }
      }

      openConfirm(next)
    } finally {
      unsub()
      setBusy(false)
      setLoadProgress(null)
    }
  }

  async function onImportNew(): Promise<void> {
    const dialog = await window.api.openImportDialog()
    if (!dialog.ok) {
      if (!dialog.canceled && dialog.error) {
        setStaleOffer(null)
        showInline('error', dialog.error)
      }
      return
    }
    setMessage(null)
    setModalError(null)
    setStaleOffer(null)
    await prepareFromPath(dialog.path, dialog.fileName)
  }

  async function onImportMetaTrader(): Promise<void> {
    setBusy(true)
    setMessage(null)
    setModalError(null)
    setStaleOffer(null)
    try {
      const preview = await window.api.mtBridgePreview()
      if (!preview.ok) {
        showInline('error', preview.error)
        return
      }
      if (preview.candles.length < MIN_1M_CANDLES_FOR_IMPORT) {
        showInline('error', minImportCandlesMessage(preview.candles.length))
        return
      }

      const match = await findReplaceTarget(
        preview.symbol,
        preview.candles[preview.candles.length - 1]?.time ?? 0
      )
      const stats = statsFromCandles(preview.candles)
      const next: PendingImport = {
        content: `MetaTrader ${preview.symbol}`,
        fileName: `MetaTrader ${preview.symbol}`,
        candles: preview.candles,
        candleCount: stats.candleCount,
        firstTime: stats.firstTime,
        lastTime: stats.lastTime,
        symbol: preview.symbol,
        symbolFromFilename: true,
        warnings: [],
        replaceId: match.replaceId,
        existingSymbol: match.existingSymbol,
        origin: 'metatrader'
      }
      if (match.skip && match.replaceId) {
        offerStaleReplace(next, match.skip)
        return
      }

      openConfirm(next)
    } finally {
      setBusy(false)
    }
  }

  async function onConfirmImport(values: { symbol: string }): Promise<void> {
    if (!pending) return
    setConfirmBusy(true)
    setModalError(null)
    setMessage(null)
    setConfirmProgress({ label: 'Building timeframes…', percent: 4 })
    await yieldToEventLoop()

    const unsub = window.api.onImportJobProgress((progress) => {
      if (progress.job === 'parse') return
      setConfirmProgress({ label: parseProgressLabel(progress), percent: progress.percent })
    })

    try {
      const symbol = normalizeSymbol(values.symbol)
      let replaceId = pending.replaceId

      if (!replaceId) {
        const match = await findReplaceTarget(symbol, pending.lastTime)
        if (match.skip && match.replaceId) {
          setPending({
            ...pending,
            symbol,
            replaceId: match.replaceId,
            existingSymbol: match.existingSymbol,
            noNewer: true,
            skipMessage: match.skip
          })
          return
        }
        replaceId = match.replaceId
      }

      const savedResult = await window.api.saveImport({
        content: pending.content,
        originalFileName: pending.fileName,
        symbol,
        parseToken: pending.parseToken,
        candles1m: pending.parseToken ? undefined : pending.candles,
        replaceId,
        origin: pending.origin
      })

      if (!savedResult.ok) {
        setModalError(savedResult.error)
        return
      }

      setConfirmProgress({
        label: 'Loading chart…',
        percent: IMPORT_BUILD_UI_PERCENT.loadingChart
      })
      await selectImportedDataset(savedResult.meta.id, savedResult.meta.timeframe)
      setPending(null)
      setModalError(null)
      setOpen(false)

      const last = formatUtcCandleTime(savedResult.meta.lastTime)
      const source = pending.origin === 'metatrader' ? 'MetaTrader' : 'CSV'
      if (pending.noNewer) {
        showBanner(
          'info',
          `Replaced ${savedResult.meta.symbol} from ${source} (${savedResult.meta.candleCount.toLocaleString()} × 1m). Built 5m · 15m · 1h · 4h · 1d.`
        )
      } else if (savedResult.updated) {
        showBanner(
          'info',
          `Updated ${savedResult.meta.symbol} from ${source}: new candles through ${last}. Built 5m · 15m · 1h · 4h · 1d.`
        )
      } else {
        showBanner(
          'info',
          `Imported ${savedResult.meta.symbol} from ${source} (${savedResult.meta.candleCount.toLocaleString()} × 1m). Built 5m · 15m · 1h · 4h · 1d.`
        )
      }

      await refreshImportedList()
    } finally {
      unsub()
      setConfirmBusy(false)
      setConfirmProgress(null)
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
        `Loaded ${entry.symbol} (${entry.candleCount.toLocaleString()} × 1m · ${isMetatraderImport(entry) ? 'MetaTrader' : 'imported'}).`
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

  const mtStatusLabel = mtBridge.connected
    ? `EA connected${mtBridge.symbol ? ` · ${mtBridge.symbol}` : ''}`
    : mtBridge.listening
      ? 'Listening · waiting for EA'
      : 'Listener idle'

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
          setStaleOffer(null)
          setOpen(true)
        }}
      >
        <Database className="h-3.5 w-3.5" />
      </IconButton>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6"
          role="presentation"
          onClick={() => closeDialog()}
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
                  {desktop
                    ? 'CSV files · MetaTrader EA · confirm to save locally'
                    : 'CSV files · confirm to save in this browser'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={disabled}
                onClick={() => closeDialog()}
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
                  {loadProgress ? (
                    <span>Importing…</span>
                  ) : busy ? (
                    <span>Reading…</span>
                  ) : (
                    <>
                      <FileUp className="h-4 w-4" aria-hidden />
                      Import MT4/MT5 1-minute CSV
                    </>
                  )}
                </button>
                {loadProgress && (
                  <div className="mt-2">
                    <ImportProgressBar progress={loadProgress} />
                  </div>
                )}
              </section>

              {desktop && (
                <section>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      MetaTrader EA
                    </span>
                    <a
                      href={EA_DOWNLOAD_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 hover:text-sky-200"
                    >
                      Download EasyCandleBridge.ex5
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                  </div>
                  <div className="mt-1.5 rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
                    <p className="flex items-center gap-2 text-xs text-zinc-300">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          mtBridge.connected
                            ? 'bg-emerald-400'
                            : mtBridge.listening
                              ? 'bg-amber-400'
                              : 'bg-zinc-600'
                        }`}
                        aria-hidden
                      />
                      <span>{mtStatusLabel}</span>
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                      Attach the Easy Candle EA in MT5 and allow {MT_BRIDGE_WS_URL}. Incoming M1
                      candles stay in preview until you confirm — same as a CSV import.
                    </p>
                    {mtBridge.error && (
                      <p className="mt-1 text-[11px] text-red-400">{mtBridge.error}</p>
                    )}
                    {mtPreview ? (
                      <div className="mt-2 rounded border border-emerald-900/60 bg-emerald-950/30 px-2.5 py-2">
                        <p className="flex items-center gap-2 text-xs font-medium text-emerald-300">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              previewFresh ? 'animate-pulse bg-emerald-400' : 'bg-emerald-700'
                            }`}
                            aria-hidden
                          />
                          <span>Preview {mtPreview.symbol} · not saved yet</span>
                        </p>
                        <p className="mt-1.5 text-[11px] text-zinc-200">
                          {mtPreview.candleCount.toLocaleString()} candles · 1m
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          From {formatUtcCandleTime(mtPreview.firstTime)}
                        </p>
                        <p
                          className={`text-[11px] ${previewFresh ? 'text-emerald-300' : 'text-zinc-400'}`}
                        >
                          Last bar {formatUtcCandleTime(mtPreview.lastTime)}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-zinc-600">
                        Waiting for M1 history from the EA…
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={disabled || !mtPreview}
                    onClick={() => void onImportMetaTrader()}
                    className="mt-1.5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded border border-sky-500/40 bg-sky-950/40 px-3 text-xs font-medium text-sky-300 hover:border-sky-400/70 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Cable className="h-4 w-4" aria-hidden />
                    Import from MetaTrader
                  </button>
                </section>
              )}

              {message && (
                <div
                  className={`space-y-2 rounded border px-3 py-2.5 ${
                    message.tone === 'error'
                      ? 'border-red-900/60 bg-red-950/20'
                      : message.tone === 'success'
                        ? 'border-emerald-900/60 bg-emerald-950/20'
                        : 'border-amber-900/60 bg-amber-950/20'
                  }`}
                >
                  <p className={`text-[11px] leading-relaxed ${messageClass}`}>{message.message}</p>
                  {staleOffer && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => openConfirm(staleOffer)}
                      className="inline-flex h-8 items-center gap-1.5 rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Replace className="h-3.5 w-3.5" aria-hidden />
                      Replace existing import
                    </button>
                  )}
                </div>
              )}

              {dataSource === 'imported' && importMeta && (
                <section className="flex items-center justify-between gap-3 rounded border border-sky-900/50 bg-sky-950/30 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-sky-300">
                      {importMeta.symbol} ·{' '}
                      {isMetatraderImport(importMeta) ? 'MetaTrader' : 'imported'}
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
                    {desktop
                      ? 'No imported datasets yet. Import a CSV or confirm a MetaTrader preview.'
                      : 'No imported datasets yet. Import a CSV to get started.'}
                  </p>
                ) : (
                  <ul className="mt-1.5 divide-y divide-zinc-800/80 rounded border border-zinc-800">
                    {importedList.map((entry) => {
                      const active = importMeta?.id === entry.id
                      const live = active && importMeta ? importMeta : entry
                      const fromMt = isMetatraderImport(live)
                      return (
                        <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 text-xs font-medium text-zinc-100">
                              {live.symbol}
                              {fromMt && (
                                <span className="rounded-sm border border-emerald-800/70 bg-emerald-950/40 px-1 py-px text-[9px] uppercase tracking-wide text-emerald-300/90">
                                  MetaTrader
                                </span>
                              )}
                              {active && (
                                <span className="rounded-sm border border-sky-700/60 bg-sky-950/50 px-1 py-px text-[9px] uppercase tracking-wide text-sky-300">
                                  Active
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                              {live.originalFileName} · {live.candleCount.toLocaleString()} × 1m
                            </p>
                            <p className="text-[11px] text-zinc-600">
                              {formatUtcCandleTime(live.firstTime)} →{' '}
                              {formatUtcCandleTime(live.lastTime)}
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
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
              <button
                type="button"
                disabled={disabled}
                onClick={() => closeDialog()}
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
        progress={confirmProgress}
        serverError={modalError}
        onCancel={() => {
          if (!confirmBusy) {
            const cancelled = pending
            setPending(null)
            setModalError(null)
            if (cancelled?.noNewer) {
              offerStaleReplace(
                cancelled,
                cancelled.skipMessage ||
                  `${cancelled.existingSymbol || cancelled.symbol || 'This symbol'} is already imported. This has no newer candles — nothing was updated.`
              )
            } else if (cancelled?.parseToken) {
              void window.api.discardImportParse(cancelled.parseToken)
            }
          }
        }}
        onConfirm={(values) => void onConfirmImport(values)}
      />
    </>
  )
}
