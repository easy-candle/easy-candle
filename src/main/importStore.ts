import { randomUUID } from 'crypto'
import { app, dialog, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { basename, join } from 'path'
import type { Candle } from '@shared/candleUtils'
import { IMPORT_STORED_TIMEFRAMES } from '@shared/candleAggregate'
import { DEFAULT_TIMEFRAME } from '@shared/timeframes'
import type {
  ImportDeleteResult,
  ImportDialogResult,
  ImportListResult,
  ImportLoadResult,
  ImportReadResult,
  ImportSaveParams,
  ImportSaveResult,
  ImportedDatasetMeta,
  ImportedTimeframeStats
} from '@shared/importTypes'
import { decodeMtTextBuffer } from '@shared/mtTextDecode'

function importsRoot(): string {
  return join(app.getPath('userData'), 'imports')
}

function datasetDir(id: string): string {
  return join(importsRoot(), id)
}

function metaPath(id: string): string {
  return join(datasetDir(id), 'meta.json')
}

function sourcePath(id: string): string {
  return join(datasetDir(id), 'source.csv')
}

function candlesPath(id: string, timeframe: string): string {
  return join(datasetDir(id), 'candles', `${timeframe}.json`)
}

async function ensureImportsRoot(): Promise<void> {
  await fs.mkdir(importsRoot(), { recursive: true })
}

async function readMeta(id: string): Promise<ImportedDatasetMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(id), 'utf8')
    const parsed = JSON.parse(raw) as ImportedDatasetMeta
    if (!parsed || typeof parsed.id !== 'string') return null
    if (!parsed.timeframes || typeof parsed.timeframes !== 'object') return null
    if (!parsed.sourceTimeframe) parsed.sourceTimeframe = '1m'
    return parsed
  } catch {
    return null
  }
}

async function writeMeta(meta: ImportedDatasetMeta): Promise<void> {
  await fs.mkdir(datasetDir(meta.id), { recursive: true })
  await fs.writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2), 'utf8')
}

function statsFor(candles: Candle[]): ImportedTimeframeStats {
  const first = candles[0]
  const last = candles[candles.length - 1]
  return {
    candleCount: candles.length,
    firstTime: first?.time ?? 0,
    lastTime: last?.time ?? 0
  }
}

function buildMeta(params: {
  id: string
  originalFileName: string
  symbol: string
  candlesByTimeframe: Record<string, Candle[]>
  activeTimeframe?: string
  createdAt?: string
}): ImportedDatasetMeta {
  const now = new Date().toISOString()
  const candles1m = params.candlesByTimeframe['1m'] || []
  const timeframes: Record<string, ImportedTimeframeStats> = {}

  for (const tf of IMPORT_STORED_TIMEFRAMES) {
    const series = params.candlesByTimeframe[tf]
    if (series?.length) timeframes[tf] = statsFor(series)
  }

  const preferred =
    params.activeTimeframe && timeframes[params.activeTimeframe]
      ? params.activeTimeframe
      : timeframes[DEFAULT_TIMEFRAME]
        ? DEFAULT_TIMEFRAME
        : '1m'

  const primary = statsFor(candles1m)

  return {
    id: params.id,
    symbol: params.symbol,
    sourceTimeframe: '1m',
    timeframe: preferred,
    originalFileName: params.originalFileName,
    candleCount: primary.candleCount,
    firstTime: primary.firstTime,
    lastTime: primary.lastTime,
    timeframes,
    createdAt: params.createdAt ?? now,
    updatedAt: now
  }
}

async function writeCandles(
  id: string,
  candlesByTimeframe: Record<string, Candle[]>
): Promise<void> {
  const dir = join(datasetDir(id), 'candles')
  await fs.mkdir(dir, { recursive: true })
  for (const tf of IMPORT_STORED_TIMEFRAMES) {
    const series = candlesByTimeframe[tf]
    if (!series) continue
    await fs.writeFile(candlesPath(id, tf), JSON.stringify(series), 'utf8')
  }
}

async function readCandles(id: string, timeframe: string): Promise<Candle[] | null> {
  try {
    const raw = await fs.readFile(candlesPath(id, timeframe), 'utf8')
    const parsed = JSON.parse(raw) as Candle[]
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

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

async function saveImport(params: ImportSaveParams): Promise<ImportSaveResult> {
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
    } else {
      id = randomUUID()
    }

    const meta = buildMeta({
      id,
      originalFileName: params.originalFileName,
      symbol: params.symbol,
      candlesByTimeframe: params.candlesByTimeframe,
      createdAt
    })

    await fs.mkdir(datasetDir(id), { recursive: true })
    await fs.writeFile(sourcePath(id), params.content, 'utf8')
    await writeCandles(id, params.candlesByTimeframe)
    await writeMeta(meta)

    return { ok: true, meta, updated }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save import'
    return { ok: false, error: message }
  }
}

async function listImports(): Promise<ImportListResult> {
  try {
    await ensureImportsRoot()
    const entries = await fs.readdir(importsRoot(), { withFileTypes: true })
    const imports: ImportedDatasetMeta[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const meta = await readMeta(entry.name)
      if (meta) imports.push(meta)
    }

    imports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return { ok: true, imports }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list imports'
    return { ok: false, error: message }
  }
}

async function loadImport(id: string, timeframe?: string): Promise<ImportLoadResult> {
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

    const candles = await readCandles(id, tf)
    if (!candles?.length) {
      return { ok: false, error: `No candles found for timeframe ${tf}.` }
    }

    const nextMeta: ImportedDatasetMeta = { ...meta, timeframe: tf }
    // Persist last-used TF so symbol re-select restores it.
    if (meta.timeframe !== tf) {
      await writeMeta({ ...nextMeta, updatedAt: meta.updatedAt })
    }

    return { ok: true, meta: nextMeta, candles }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load import'
    return { ok: false, error: message }
  }
}

async function deleteImport(id: string): Promise<ImportDeleteResult> {
  try {
    const dir = datasetDir(id)
    await fs.rm(dir, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete import'
    return { ok: false, error: message }
  }
}

export function registerImportIpc(): void {
  ipcMain.handle('import:openDialog', async (): Promise<ImportDialogResult> => openCsvDialog())
  ipcMain.handle('import:readFile', async (_event, filePath: string): Promise<ImportReadResult> =>
    readCsvFile(String(filePath || ''))
  )
  ipcMain.handle('import:save', async (_event, params: ImportSaveParams): Promise<ImportSaveResult> =>
    saveImport(params)
  )
  ipcMain.handle('import:list', async (): Promise<ImportListResult> => listImports())
  ipcMain.handle(
    'import:load',
    async (_event, id: string, timeframe?: string): Promise<ImportLoadResult> =>
      loadImport(String(id || ''), timeframe ? String(timeframe) : undefined)
  )
  ipcMain.handle('import:delete', async (_event, id: string): Promise<ImportDeleteResult> =>
    deleteImport(String(id || ''))
  )
}
