import { randomUUID } from 'crypto'
import { app, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'fs'
import { basename, join } from 'path'
import { mergeCandlesByTime, type Candle } from '@shared/candleUtils'
import { buildImportTimeframes, IMPORT_STORED_TIMEFRAMES } from '@shared/candleAggregate'
import { buildImportedDatasetMeta } from '@shared/importMeta'
import { IMPORT_BUILD_UI_PERCENT, type ImportJobProgress } from '@shared/importJobProgress'
import { clientParseResult } from '@shared/importWorkerJob'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { mtDatasetId } from '@shared/mtBridgeProtocol'
import { parseCsvInWorker, buildTimeframesInWorker } from './importWorkerHost'
import {
  applyMtPreviewState,
  summarizeMtPreview,
  type MtPreviewState,
  type MtPreviewSummary
} from '@shared/mtPreview'
import type {
  ImportDeleteResult,
  ImportDialogResult,
  ImportListResult,
  ImportLoadRange,
  ImportLoadResult,
  ImportReadResult,
  ImportSaveParams,
  ImportSaveResult,
  ImportedDatasetMeta,
  ImportParseResult
} from '@shared/importTypes'
import { isMetatraderImport } from '@shared/importTypes'
import { sliceCandleRange } from '@shared/importRange'
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

const savedMtBySymbol = new Map<string, string>()
let mtPreview: MtPreviewState | null = null

function rememberSavedMtDataset(meta: ImportedDatasetMeta): void {
  if (!isMetatraderImport(meta)) return
  const symbol = String(meta.symbol || '')
    .trim()
    .toUpperCase()
  if (symbol) savedMtBySymbol.set(symbol, meta.id)
}

export function getMtPreviewSummary(): MtPreviewSummary | null {
  return summarizeMtPreview(mtPreview)
}

export function getMtPreviewCandles(): MtPreviewState | null {
  return mtPreview
}

export function applyIncomingMtPreview(
  symbol: string,
  incoming: Candle[]
): MtPreviewSummary | null {
  mtPreview = applyMtPreviewState(mtPreview, symbol, incoming)
  return summarizeMtPreview(mtPreview)
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

const pendingParses = new Map<
  string,
  { token: string; content: string; candles: Candle[]; fileName: string }
>()

function sendImportProgress(event: IpcMainInvokeEvent, progress: ImportJobProgress): void {
  if (!event.sender.isDestroyed()) {
    event.sender.send(IPC_CHANNELS.IMPORT_JOB_PROGRESS, progress)
  }
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer
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

async function parseImportFile(
  filePath: string,
  onProgress?: (progress: ImportJobProgress) => void
): Promise<ImportParseResult> {
  try {
    const buffer = await fs.readFile(filePath)
    const bytes = bufferToArrayBuffer(buffer)
    const fileName = basename(filePath)
    const { result, content } = await parseCsvInWorker(bytes, fileName, onProgress)
    if (!result.ok) return result
    const token = randomUUID()
    pendingParses.set(token, {
      token,
      content,
      candles: result.candles,
      fileName
    })
    return clientParseResult(result, token)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read file'
    return { ok: false, error: message }
  }
}

function discardPendingParse(token: string): void {
  pendingParses.delete(token)
}

async function saveImport(
  params: ImportSaveParams,
  onProgress?: (progress: ImportJobProgress) => void
): Promise<ImportSaveResult> {
  try {
    await ensureImportsRoot()

    let content = params.content ?? ''
    let candlesByTimeframe = params.candlesByTimeframe
    let candles1m = candlesByTimeframe?.['1m'] ?? params.candles1m

    if (params.parseToken) {
      const pending = pendingParses.get(params.parseToken)
      if (!pending) {
        return { ok: false, error: 'Import parse expired. Select the CSV again.' }
      }
      content = pending.content
      candles1m = pending.candles
    }

    if (!candles1m?.length && params.origin === 'metatrader') {
      const preview = getMtPreviewCandles()
      if (preview?.candles.length) {
        candles1m = preview.candles
        if (!content) content = `MetaTrader ${params.symbol}`
      }
    }

    if (!candlesByTimeframe?.['1m'] && candles1m?.length) {
      candlesByTimeframe = await buildTimeframesInWorker(candles1m, onProgress)
    }

    if (!candlesByTimeframe?.['1m']?.length) {
      return { ok: false, error: 'Missing 1-minute candles for import.' }
    }

    onProgress?.({
      job: 'save',
      phase: 'Saving…',
      percent: IMPORT_BUILD_UI_PERCENT.saving
    })

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
    const meta = buildImportedDatasetMeta({
      id,
      originalFileName: params.originalFileName,
      symbol: params.symbol,
      candlesByTimeframe,
      createdAt,
      origin
    })

    await fs.mkdir(datasetDir(id), { recursive: true })
    await fs.writeFile(sourcePath(id), content, 'utf8')
    await writeCandles(id, candlesByTimeframe)
    await writeMeta(meta)
    rememberSavedMtDataset(meta)
    if (params.parseToken) pendingParses.delete(params.parseToken)

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
      if (meta) {
        imports.push(meta)
        rememberSavedMtDataset(meta)
      }
    }

    imports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return { ok: true, imports }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list imports'
    return { ok: false, error: message }
  }
}

async function loadImport(
  id: string,
  timeframe?: string,
  range?: ImportLoadRange
): Promise<ImportLoadResult> {
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

async function deleteImport(id: string): Promise<ImportDeleteResult> {
  try {
    const dir = datasetDir(id)
    await fs.rm(dir, { recursive: true, force: true })
    mtMemory.delete(id)
    const timer = mtFlushTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      mtFlushTimers.delete(id)
    }
    for (const [symbol, savedId] of savedMtBySymbol) {
      if (savedId === id) savedMtBySymbol.delete(symbol)
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete import'
    return { ok: false, error: message }
  }
}

const MT_FLUSH_MS = 500

type MtMemory = {
  candles1m: Candle[]
  meta: ImportedDatasetMeta
  dirty: boolean
}

const mtMemory = new Map<string, MtMemory>()
const mtFlushTimers = new Map<string, ReturnType<typeof setTimeout>>()

export type MtUpsertResult =
  | { ok: true; persisted: true; meta: ImportedDatasetMeta; candles1m: Candle[] }
  | { ok: true; persisted: false }
  | { ok: false; error: string }

async function savedMtId(symbol: string): Promise<string | null> {
  const hinted = savedMtBySymbol.get(symbol) || mtDatasetId(symbol)
  const meta = await readMeta(hinted)
  if (meta) {
    rememberSavedMtDataset(meta)
    return hinted
  }
  return savedMtBySymbol.get(symbol) ?? null
}

async function loadMtMemory(id: string, symbol: string): Promise<MtMemory | null> {
  const cached = mtMemory.get(id)
  if (cached) return cached

  const meta = await readMeta(id)
  if (!meta) return null
  const candles1m = (await readCandles(id, '1m')) ?? []
  const memory: MtMemory = {
    candles1m,
    meta: { ...meta, symbol, origin: 'metatrader' },
    dirty: false
  }
  mtMemory.set(id, memory)
  return memory
}

async function persistMtMemory(id: string): Promise<ImportedDatasetMeta | null> {
  const memory = mtMemory.get(id)
  if (!memory || !memory.candles1m.length) return memory?.meta ?? null

  const candlesByTimeframe = buildImportTimeframes(memory.candles1m)
  const meta = buildImportedDatasetMeta({
    id,
    symbol: memory.meta.symbol,
    originalFileName: `MetaTrader ${memory.meta.symbol}`,
    candlesByTimeframe,
    createdAt: memory.meta.createdAt,
    activeTimeframe: memory.meta.timeframe,
    origin: 'metatrader'
  })

  await fs.mkdir(datasetDir(id), { recursive: true })
  await writeCandles(id, candlesByTimeframe)
  await writeMeta(meta)
  memory.meta = meta
  memory.dirty = false
  rememberSavedMtDataset(meta)
  return meta
}

function scheduleMtFlush(id: string): void {
  const previous = mtFlushTimers.get(id)
  if (previous) clearTimeout(previous)
  const timer = setTimeout(() => {
    mtFlushTimers.delete(id)
    void persistMtMemory(id)
  }, MT_FLUSH_MS)
  mtFlushTimers.set(id, timer)
}

export async function upsertMtCandles(params: {
  symbol: string
  incoming: Candle[]
  flush: boolean
}): Promise<MtUpsertResult> {
  const symbol = String(params.symbol || '')
    .trim()
    .toUpperCase()
  if (!symbol) return { ok: false, error: 'Missing MetaTrader symbol.' }
  if (!params.incoming?.length) return { ok: false, error: 'No MetaTrader bars to store.' }

  const id = await savedMtId(symbol)
  if (!id) return { ok: true, persisted: false }

  const memory = await loadMtMemory(id, symbol)
  if (!memory) return { ok: true, persisted: false }

  memory.candles1m = mergeCandlesByTime(memory.candles1m, params.incoming)
  memory.dirty = true

  if (params.flush) {
    const previous = mtFlushTimers.get(id)
    if (previous) {
      clearTimeout(previous)
      mtFlushTimers.delete(id)
    }
    const meta = await persistMtMemory(id)
    if (!meta) return { ok: false, error: 'Failed to write MetaTrader dataset.' }
    rememberSavedMtDataset(meta)
    return { ok: true, persisted: true, meta, candles1m: memory.candles1m }
  }

  scheduleMtFlush(id)
  return { ok: true, persisted: true, meta: memory.meta, candles1m: memory.candles1m }
}

export async function flushAllMtDatasets(): Promise<void> {
  const ids = [...mtMemory.keys()]
  for (const id of ids) {
    const timer = mtFlushTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      mtFlushTimers.delete(id)
    }
    if (mtMemory.get(id)?.dirty) {
      await persistMtMemory(id)
    }
  }
}

export function registerImportIpc(): void {
  ipcMain.handle(IPC_CHANNELS.IMPORT_OPEN_DIALOG, async (): Promise<ImportDialogResult> =>
    openCsvDialog()
  )
  ipcMain.handle(
    IPC_CHANNELS.IMPORT_READ_FILE,
    async (_event, filePath: string): Promise<ImportReadResult> =>
      readCsvFile(String(filePath || ''))
  )
  ipcMain.handle(
    IPC_CHANNELS.IMPORT_PARSE_FILE,
    async (event, filePath: string): Promise<ImportParseResult> =>
      parseImportFile(String(filePath || ''), (progress) => sendImportProgress(event, progress))
  )
  ipcMain.handle(
    IPC_CHANNELS.IMPORT_DISCARD_PARSE,
    async (_event, token: string): Promise<{ ok: true }> => {
      discardPendingParse(String(token || ''))
      return { ok: true }
    }
  )
  ipcMain.handle(
    IPC_CHANNELS.IMPORT_SAVE,
    async (event, params: ImportSaveParams): Promise<ImportSaveResult> =>
      saveImport(params, (progress) => sendImportProgress(event, progress))
  )
  ipcMain.handle(IPC_CHANNELS.IMPORT_LIST, async (): Promise<ImportListResult> => listImports())
  ipcMain.handle(
    IPC_CHANNELS.IMPORT_LOAD,
    async (
      _event,
      id: string,
      timeframe?: string,
      range?: ImportLoadRange
    ): Promise<ImportLoadResult> =>
      loadImport(String(id || ''), timeframe ? String(timeframe) : undefined, range)
  )
  ipcMain.handle(
    IPC_CHANNELS.IMPORT_DELETE,
    async (_event, id: string): Promise<ImportDeleteResult> => deleteImport(String(id || ''))
  )
  void listImports()
}
