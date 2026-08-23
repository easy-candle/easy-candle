import { randomUUID } from 'crypto'
import { dialog, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { basename } from 'path'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { mtDatasetId } from '@shared/mtBridgeProtocol'
import type {
  DatasetDeleteResult,
  ImportDialogResult,
  DatasetListResult,
  DatasetLoadRange,
  DatasetLoadResult,
  ImportReadResult,
  DatasetSaveParams,
  DatasetSaveResult,
  ImportedDatasetMeta
} from '@shared/datasetTypes'
import { sliceCandleRange } from '@shared/importRange'
import { decodeMtTextBuffer } from '@shared/mtTextDecode'
import {
  buildMeta,
  deleteDatasetDir,
  ensureImportsRoot,
  listDatasetDirs,
  readCandles,
  readMeta,
  writeCandles,
  writeMeta,
  writeSource
} from './storage'
import { forgetMtDataset, rememberSavedMtDataset } from './mtLive'

export {
  applyIncomingMtPreview,
  flushAllMtDatasets,
  getMtPreviewCandles,
  getMtPreviewSummary,
  upsertMtCandles,
  type MtUpsertResult
} from './mtLive'

async function openCsvDialog(): Promise<ImportDialogResult> {
  const result = await dialog.showOpenDialog({
    title: 'Import MT4/MT5 1-minute candles',
    properties: ['openFile'],
    filters: [
      { name: 'CSV / TXT', extensions: ['csv', 'txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })

  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true }
  }

  const path = result.filePaths[0]
  return { ok: true, path, fileName: basename(path) }
}

async function readCsvFile(filePath: string): Promise<ImportReadResult> {
  try {
    const buffer = await fs.readFile(filePath)
    const content = decodeMtTextBuffer(buffer)
    return { ok: true, content, fileName: basename(filePath) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read file'
    return { ok: false, error: message }
  }
}

async function saveDataset(params: DatasetSaveParams): Promise<DatasetSaveResult> {
  try {
    await ensureImportsRoot()

    const candles1m = params.candlesByTimeframe?.['1m']
    if (!candles1m?.length) {
      return { ok: false, error: 'Missing 1-minute candles for import.' }
    }

    let id = params.replaceId
    let createdAt: string | undefined
    let updated = false

    if (id) {
      const existing = await readMeta(id)
      if (!existing) {
        return { ok: false, error: 'Saved import not found for update.' }
      }
      createdAt = existing.createdAt
      updated = true
    } else if (params.origin === 'metatrader') {
      id = mtDatasetId(params.symbol)
      const existing = await readMeta(id)
      if (existing) {
        createdAt = existing.createdAt
        updated = true
      }
    } else {
      id = randomUUID()
    }

    const origin = params.origin ?? 'csv'
    const meta = buildMeta({
      id,
      originalFileName: params.originalFileName,
      symbol: params.symbol,
      candlesByTimeframe: params.candlesByTimeframe,
      createdAt,
      origin
    })

    await writeSource(id, params.content)
    await writeCandles(id, params.candlesByTimeframe)
    await writeMeta(meta)
    rememberSavedMtDataset(meta)

    return { ok: true, meta, updated }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save import'
    return { ok: false, error: message }
  }
}

async function listDatasets(): Promise<DatasetListResult> {
  try {
    await ensureImportsRoot()
    const dirs = await listDatasetDirs()
    const datasets: ImportedDatasetMeta[] = []

    for (const id of dirs) {
      const meta = await readMeta(id)
      if (meta) {
        datasets.push(meta)
        rememberSavedMtDataset(meta)
      }
    }

    datasets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return { ok: true, datasets }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list imports'
    return { ok: false, error: message }
  }
}

async function loadDataset(
  id: string,
  timeframe?: string,
  range?: DatasetLoadRange
): Promise<DatasetLoadResult> {
  try {
    const meta = await readMeta(id)
    if (!meta) return { ok: false, error: 'Saved import not found.' }

    const requested = String(timeframe || meta.timeframe || '1m')
    const tf =
      meta.timeframes[requested] != null
        ? requested
        : meta.timeframes['1m'] != null
          ? '1m'
          : Object.keys(meta.timeframes)[0]

    if (!tf) return { ok: false, error: 'Imported dataset has no candle series.' }

    const stored = await readCandles(id, tf)
    if (!stored?.length) {
      return { ok: false, error: `No candles found for timeframe ${tf}.` }
    }

    // Range slicing happens here so the renderer never receives the full series
    // over IPC when it only needs a window.
    const sliced = sliceCandleRange(stored, range)

    const nextMeta: ImportedDatasetMeta = { ...meta, timeframe: tf }
    // Persist last-used TF so symbol re-select restores it.
    if (meta.timeframe !== tf) {
      await writeMeta({ ...nextMeta, updatedAt: meta.updatedAt })
    }

    return { ok: true, meta: nextMeta, candles: sliced.candles, window: sliced.window }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load import'
    return { ok: false, error: message }
  }
}

async function deleteDataset(id: string): Promise<DatasetDeleteResult> {
  try {
    forgetMtDataset(id)
    await deleteDatasetDir(id)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete import'
    return { ok: false, error: message }
  }
}

export function registerDatasetIpc(): void {
  ipcMain.handle(IPC_CHANNELS.IMPORT_OPEN_DIALOG, async (): Promise<ImportDialogResult> =>
    openCsvDialog()
  )
  ipcMain.handle(
    IPC_CHANNELS.IMPORT_READ_FILE,
    async (_event, filePath: string): Promise<ImportReadResult> =>
      readCsvFile(String(filePath || ''))
  )
  ipcMain.handle(
    IPC_CHANNELS.DATASET_SAVE,
    async (_event, params: DatasetSaveParams): Promise<DatasetSaveResult> => saveDataset(params)
  )
  ipcMain.handle(IPC_CHANNELS.DATASET_LIST, async (): Promise<DatasetListResult> => listDatasets())
  ipcMain.handle(
    IPC_CHANNELS.DATASET_LOAD,
    async (
      _event,
      id: string,
      timeframe?: string,
      range?: DatasetLoadRange
    ): Promise<DatasetLoadResult> =>
      loadDataset(String(id || ''), timeframe ? String(timeframe) : undefined, range)
  )
  ipcMain.handle(
    IPC_CHANNELS.DATASET_DELETE,
    async (_event, id: string): Promise<DatasetDeleteResult> => deleteDataset(String(id || ''))
  )
  void listDatasets()
}
