import { useCallback, useEffect, useState } from 'react'
import { FileUp, FolderOpen, RefreshCw, Trash2, X } from 'lucide-react'
import IconButton from '@/components/IconButton'
import ImportConfirmModal, {
  type ImportConfirmDetails
} from '@/components/ImportConfirmModal'
import { parseMtCsv } from '@shared/mtCsvImport'
import type { Candle } from '@shared/candleUtils'
import type { ImportedDatasetMeta } from '@shared/importTypes'
import { useReplayStore } from '@/store/replayStore'
import { formatUtcCandleTime } from '@/lib/utcDateTime'

export type ImportFeedback = {
  tone: 'error' | 'info'
  message: string
}

type PendingImport = ImportConfirmDetails & {
  content: string
  replaceId?: string
  existingMetaId?: string
}

type CsvImportControlsProps = {
  onFeedback?: (feedback: ImportFeedback | null) => void
}

export default function CsvImportControls({ onFeedback }: CsvImportControlsProps) {
  const mode = useReplayStore((s) => s.mode)
  const status = useReplayStore((s) => s.status)
  const dataSource = useReplayStore((s) => s.dataSource)
  const importMeta = useReplayStore((s) => s.importMeta)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const activateImportedDataset = useReplayStore((s) => s.activateImportedDataset)
  const clearImportedDataset = useReplayStore((s) => s.clearImportedDataset)

  const [saved, setSaved] = useState<ImportedDatasetMeta[]>([])
  const [busy, setBusy] = useState(false)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)

  const disabled =
    mode === 'replay' || status === 'loading' || replayLoading || busy || pending != null

  const clearFeedback = useCallback((): void => {
    onFeedback?.(null)
  }, [onFeedback])

  const showBannerError = useCallback(
    (message: string): void => {
      onFeedback?.({ tone: 'error', message })
    },
    [onFeedback]
  )

  const refreshList = useCallback(async (): Promise<void> => {
    const result = await window.api.listImports()
    if (result.ok) setSaved(result.imports)
  }, [])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  function openConfirm(params: {
    content: string
    fileName: string
    candles: Candle[]
    symbol: string | null
    timeframe: string | null
    inferredTimeframe: string
    symbolFromFilename: boolean
    timeframeFromFilename: boolean
    warnings: string[]
    replaceId?: string
    existingMetaId?: string
  }): void {
    clearFeedback()
    setModalError(null)
    setPending({
      content: params.content,
      fileName: params.fileName,
      candles: params.candles,
      symbol: params.symbol,
      timeframe: params.timeframe,
      inferredTimeframe: params.inferredTimeframe,
      symbolFromFilename: params.symbolFromFilename,
      timeframeFromFilename: params.timeframeFromFilename,
      warnings: params.warnings,
      replaceId: params.replaceId,
      existingMetaId: params.existingMetaId
    })
  }

  async function prepareFromPath(
    path: string,
    fileName: string,
    replaceId?: string
  ): Promise<void> {
    setBusy(true)
    clearFeedback()
    setModalError(null)

    try {
      const read = await window.api.readImportFile(path)
      if (!read.ok) {
        showBannerError(read.error)
        return
      }

      const parsed = parseMtCsv(read.content, fileName || read.fileName)
      if (!parsed.ok) {
        showBannerError(parsed.error)
        return
      }

      openConfirm({
        content: read.content,
        fileName: fileName || read.fileName,
        candles: parsed.candles,
        symbol: parsed.symbol,
        timeframe: parsed.timeframe,
        inferredTimeframe: parsed.inferredTimeframe,
        symbolFromFilename: parsed.symbolFromFilename,
        timeframeFromFilename: parsed.timeframeFromFilename,
        warnings: parsed.warnings,
        replaceId
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
      if (!dialog.canceled && dialog.error) showBannerError(dialog.error)
      return
    }
    await prepareFromPath(dialog.path, dialog.fileName)
  }

  async function onUpdateActive(): Promise<void> {
    if (!importMeta) return
    clearFeedback()
    setModalError(null)
    const dialog = await window.api.openImportDialog()
    if (!dialog.ok) {
      if (!dialog.canceled && dialog.error) showBannerError(dialog.error)
      return
    }
    await prepareFromPath(dialog.path, dialog.fileName, importMeta.id)
  }

  async function onLoadSaved(id: string): Promise<void> {
    if (!id) return
    setBusy(true)
    clearFeedback()
    setModalError(null)
    try {
      const loaded = await window.api.loadImport(id)
      if (!loaded.ok) {
        showBannerError(loaded.error)
        return
      }

      const parsed = parseMtCsv(loaded.content, loaded.meta.originalFileName)
      if (!parsed.ok) {
        showBannerError(parsed.error)
        return
      }

      openConfirm({
        content: loaded.content,
        fileName: loaded.meta.originalFileName,
        candles: parsed.candles,
        symbol: parsed.symbol ?? loaded.meta.symbol,
        timeframe: parsed.timeframe ?? loaded.meta.timeframe,
        inferredTimeframe: parsed.inferredTimeframe,
        symbolFromFilename: parsed.symbolFromFilename || Boolean(loaded.meta.symbol),
        timeframeFromFilename: parsed.timeframeFromFilename || Boolean(loaded.meta.timeframe),
        warnings: parsed.warnings,
        existingMetaId: loaded.meta.id
      })
    } finally {
      setBusy(false)
    }
  }

  async function onConfirmImport(values: { symbol: string; timeframe: string }): Promise<void> {
    if (!pending) return
    setConfirmBusy(true)
    setModalError(null)
    clearFeedback()

    try {
      const savedResult = await window.api.saveImport({
        content: pending.content,
        originalFileName: pending.fileName,
        symbol: values.symbol,
        timeframe: values.timeframe,
        candles: pending.candles,
        replaceId: pending.replaceId ?? pending.existingMetaId
      })

      if (!savedResult.ok) {
        setModalError(savedResult.error)
        return
      }

      activateImportedDataset(pending.candles, savedResult.meta)
      setPending(null)
      setModalError(null)
      clearFeedback()
      await refreshList()
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
        showBannerError(result.error)
        return
      }
      if (importMeta?.id === id) {
        clearImportedDataset()
      }
      await refreshList()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
        <IconButton
          label="Import MT4/MT5 CSV"
          disabled={disabled}
          onClick={() => void onImportNew()}
          tone="accent"
          className="!w-auto gap-1.5 px-2.5"
        >
          <FileUp className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">{busy ? '…' : 'Import'}</span>
        </IconButton>

        {saved.length > 0 && (
          <label className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/80 px-2">
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
            <select
              className="max-w-[11rem] rounded bg-zinc-900 text-zinc-100 outline-none disabled:opacity-60"
              disabled={disabled}
              aria-label="Saved imports"
              value={dataSource === 'imported' && importMeta ? importMeta.id : ''}
              onChange={(event) => void onLoadSaved(event.target.value)}
            >
              <option value="" className="bg-zinc-900 text-zinc-100">
                Saved imports…
              </option>
              {saved.map((entry) => (
                <option key={entry.id} value={entry.id} className="bg-zinc-900 text-zinc-100">
                  {entry.symbol} {entry.timeframe} · {entry.candleCount.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
        )}

        {dataSource === 'imported' && importMeta && (
          <>
            <span
              className="hidden max-w-[10rem] truncate text-[11px] text-amber-400/90 lg:inline"
              title={`${importMeta.originalFileName} · ${formatUtcCandleTime(importMeta.firstTime)} → ${formatUtcCandleTime(importMeta.lastTime)}`}
            >
              {importMeta.symbol} · {importMeta.timeframe}
            </span>
            <IconButton
              label="Update imported CSV"
              disabled={disabled}
              onClick={() => void onUpdateActive()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </IconButton>
            {importMeta.id && (
              <IconButton
                label="Delete saved import"
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
