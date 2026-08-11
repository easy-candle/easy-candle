import { useCallback, useEffect, useState } from 'react'
import { FileUp, Trash2, X } from 'lucide-react'
import IconButton from '@/components/IconButton'
import ImportConfirmModal, {
  type ImportConfirmDetails
} from '@/components/ImportConfirmModal'
import { buildImportTimeframes } from '@shared/candleAggregate'
import { hasNewerCandles } from '@shared/importTypes'
import { parseMtCsv } from '@shared/mtCsvImport'
import type { Candle } from '@shared/candleUtils'
import { useReplayStore } from '@/store/replayStore'
import { formatUtcCandleTime } from '@/lib/utcDateTime'

export type ImportFeedback = {
  tone: 'error' | 'info'
  message: string
}

type PendingImport = ImportConfirmDetails & {
  content: string
}

type CsvImportControlsProps = {
  onFeedback?: (feedback: ImportFeedback | null) => void
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export default function CsvImportControls({ onFeedback }: CsvImportControlsProps) {
  const mode = useReplayStore((s) => s.mode)
  const status = useReplayStore((s) => s.status)
  const dataSource = useReplayStore((s) => s.dataSource)
  const importMeta = useReplayStore((s) => s.importMeta)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const activateImportedDataset = useReplayStore((s) => s.activateImportedDataset)
  const clearImportedDataset = useReplayStore((s) => s.clearImportedDataset)
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)

  const [busy, setBusy] = useState(false)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)

  const disabled =
    mode === 'replay' || status === 'loading' || replayLoading || busy || pending != null

  const clearFeedback = useCallback((): void => {
    onFeedback?.(null)
  }, [onFeedback])

  const showBanner = useCallback(
    (tone: ImportFeedback['tone'], message: string): void => {
      onFeedback?.({ tone, message })
    },
    [onFeedback]
  )

  useEffect(() => {
    void refreshImportedList()
  }, [refreshImportedList])

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
    clearFeedback()
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
    clearFeedback()
    setModalError(null)

    try {
      const read = await window.api.readImportFile(path)
      if (!read.ok) {
        showBanner('error', read.error)
        return
      }

      const parsed = parseMtCsv(read.content, fileName || read.fileName)
      if (!parsed.ok) {
        showBanner('error', parsed.error)
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
                showBanner(
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
    clearFeedback()
    setModalError(null)
    const dialog = await window.api.openImportDialog()
    if (!dialog.ok) {
      if (!dialog.canceled && dialog.error) showBanner('error', dialog.error)
      return
    }
    await prepareFromPath(dialog.path, dialog.fileName)
  }

  async function onConfirmImport(values: { symbol: string }): Promise<void> {
    if (!pending) return
    setConfirmBusy(true)
    setModalError(null)
    clearFeedback()

    try {
      const symbol = normalizeSymbol(values.symbol)
      let replaceId = pending.replaceId

      // Symbol typed in the modal may match an existing import even when the file name did not.
      if (!replaceId) {
        const listed = await window.api.listImports()
        if (listed.ok) {
          const existing = listed.imports.find(
            (entry) => normalizeSymbol(entry.symbol) === symbol
          )
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
    clearFeedback()
    try {
      const result = await window.api.deleteImport(id)
      if (!result.ok) {
        showBanner('error', result.error)
        return
      }
      if (importMeta?.id === id) {
        clearImportedDataset()
      }
      await refreshImportedList()
      showBanner('info', 'Imported symbol removed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
        <IconButton
          label="Import MT4/MT5 1-minute CSV"
          disabled={disabled}
          onClick={() => void onImportNew()}
          tone="accent"
          className="!w-auto gap-1.5 px-2.5"
        >
          <FileUp className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">{busy ? '…' : 'Import'}</span>
        </IconButton>

        {dataSource === 'imported' && importMeta && (
          <>
            <span
              className="hidden max-w-[12rem] truncate text-[11px] text-amber-400/90 lg:inline"
              title={`${importMeta.originalFileName} · ${formatUtcCandleTime(importMeta.firstTime)} → ${formatUtcCandleTime(importMeta.lastTime)}`}
            >
              {importMeta.symbol} · imported
            </span>
            {importMeta.id && (
              <IconButton
                label="Delete imported symbol"
                disabled={disabled}
                tone="danger"
                onClick={() => void onDeleteSaved(importMeta.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconButton>
            )}
            <IconButton
              label="Exit imported mode"
              disabled={disabled}
              onClick={() => {
                clearFeedback()
                clearImportedDataset()
              }}
            >
              <X className="h-3.5 w-3.5" />
            </IconButton>
          </>
        )}
      </div>

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
