import type { Candle } from '@shared/candleUtils'
import { IMPORT_STORED_TIMEFRAMES } from '@shared/candleAggregate'
import { DEFAULT_TIMEFRAME } from '@shared/timeframes'
import { decodeMtTextBuffer } from '@shared/mtTextDecode'
import { fetchKlinesResult } from '@shared/klinesService'
import type { EasyCandleApi } from '../../../preload'
import type {
  DatasetDeleteResult,
  ImportDialogResult,
  DatasetListResult,
  DatasetLoadRange,
  DatasetLoadResult,
  ImportReadResult,
  DatasetSaveParams,
  DatasetSaveResult,
  ImportedDatasetMeta,
  ImportedTimeframeStats
} from '@shared/datasetTypes'
import { sliceCandleRange } from '@shared/importRange'
import {
  DEFAULT_MT_BRIDGE_STATUS,
  type MtBridgeIpcEvent,
  type MtBridgeStatusResult,
  type MtPreviewLoadResult
} from '@shared/mtBridgeTypes'
import type {
  UpdateAvailableInfo,
  UpdateDownloadedInfo,
  UpdateErrorInfo,
  UpdateProgressInfo
} from '@shared/updaterTypes'

const MT_WEB_DISABLED = 'MetaTrader EA import is only available in the desktop app.'

function webMtStatus(ok = true): MtBridgeStatusResult {
  return { ...DEFAULT_MT_BRIDGE_STATUS, ok }
}

// --- In-Memory & IndexedDB Storage for Imported CSVs ---
const DB_NAME = 'easycandle_db'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'))
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('metas')) {
        db.createObjectStore('metas', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('candles')) {
        db.createObjectStore('candles', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('sources')) {
        db.createObjectStore('sources', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Fallback in-memory store
const memoryMetas = new Map<string, ImportedDatasetMeta>()
const memoryCandles = new Map<string, Candle[]>()
const memorySources = new Map<string, string>()

// In-flight selected files cache for import modal
const pendingFileCache = new Map<string, { content: string; fileName: string }>()

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'imp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
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

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function idbPut(storeName: string, value: unknown): Promise<boolean> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.put(value)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

async function idbDelete(storeName: string, key: string): Promise<boolean> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.delete(key)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

// --- Import Operations ---

async function saveDataset(params: DatasetSaveParams): Promise<DatasetSaveResult> {
  try {
    const candles1m = params.candlesByTimeframe?.['1m']
    if (!candles1m?.length) {
      return { ok: false, error: 'Missing 1-minute candles for import.' }
    }

    let id = params.replaceId
    let createdAt: string | undefined
    let updated = false

    if (id) {
      const existing = (await idbGet<ImportedDatasetMeta>('metas', id)) || memoryMetas.get(id)
      if (!existing) {
        return { ok: false, error: 'Saved import not found for update.' }
      }
      createdAt = existing.createdAt
      updated = true
    } else {
      id = generateId()
    }

    const meta = buildMeta({
      id,
      originalFileName: params.originalFileName,
      symbol: params.symbol,
      candlesByTimeframe: params.candlesByTimeframe,
      createdAt
    })

    // Store in memory
    memoryMetas.set(id, meta)
    memorySources.set(id, params.content)

    // Store in IDB
    await idbPut('metas', meta)
    await idbPut('sources', { id, content: params.content })

    for (const tf of IMPORT_STORED_TIMEFRAMES) {
      const series = params.candlesByTimeframe[tf]
      if (series) {
        const key = `${id}:${tf}`
        memoryCandles.set(key, series)
        await idbPut('candles', { key, candles: series })
      }
    }

    return { ok: true, meta, updated }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save import'
    return { ok: false, error: message }
  }
}

async function listDatasets(): Promise<DatasetListResult> {
  try {
    let datasets = await idbGetAll<ImportedDatasetMeta>('metas')
    if (!datasets.length && memoryMetas.size > 0) {
      datasets = Array.from(memoryMetas.values())
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
    const meta = (await idbGet<ImportedDatasetMeta>('metas', id)) || memoryMetas.get(id)
    if (!meta) return { ok: false, error: 'Saved import not found.' }

    const requested = String(timeframe || meta.timeframe || '1m')
    const tf =
      meta.timeframes[requested] != null
        ? requested
        : meta.timeframes['1m'] != null
          ? '1m'
          : Object.keys(meta.timeframes)[0]

    if (!tf) return { ok: false, error: 'Imported dataset has no candle series.' }

    const key = `${id}:${tf}`
    const storedCandles = await idbGet<{ key: string; candles: Candle[] }>('candles', key)
    const stored = storedCandles?.candles || memoryCandles.get(key)

    if (!stored?.length) {
      return { ok: false, error: `No candles found for timeframe ${tf}.` }
    }

    // Same range contract as the desktop IPC handler, so the store can page
    // windows without knowing which backend it talks to.
    const sliced = sliceCandleRange(stored, range)

    const nextMeta: ImportedDatasetMeta = { ...meta, timeframe: tf }
    if (meta.timeframe !== tf) {
      memoryMetas.set(id, nextMeta)
      await idbPut('metas', nextMeta)
    }

    return { ok: true, meta: nextMeta, candles: sliced.candles, window: sliced.window }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load import'
    return { ok: false, error: message }
  }
}

async function deleteDataset(id: string): Promise<DatasetDeleteResult> {
  try {
    memoryMetas.delete(id)
    memorySources.delete(id)
    await idbDelete('metas', id)
    await idbDelete('sources', id)

    for (const tf of IMPORT_STORED_TIMEFRAMES) {
      const key = `${id}:${tf}`
      memoryCandles.delete(key)
      await idbDelete('candles', key)
    }

    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete import'
    return { ok: false, error: message }
  }
}

function promptCsvFileInput(): Promise<ImportDialogResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,.txt'
    input.style.display = 'none'

    let handled = false

    const cleanup = () => {
      input.remove()
      window.removeEventListener('focus', onFocus)
    }

    const onFocus = () => {
      // Delay to allow change event to fire first if a file was selected
      setTimeout(() => {
        if (!handled) {
          handled = true
          cleanup()
          resolve({ ok: false, canceled: true })
        }
      }, 500)
    }

    input.onchange = async () => {
      if (handled) return
      handled = true
      cleanup()

      const file = input.files?.[0]
      if (!file) {
        resolve({ ok: false, canceled: true })
        return
      }

      try {
        const buffer = await file.arrayBuffer()
        const content =
          typeof Buffer !== 'undefined'
            ? decodeMtTextBuffer(Buffer.from(buffer))
            : new TextDecoder('utf-8').decode(buffer)
        const tempId = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
        pendingFileCache.set(tempId, { content, fileName: file.name })
        resolve({ ok: true, path: tempId, fileName: file.name })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to read selected file'
        resolve({ ok: false, error: message })
      }
    }

    document.body.appendChild(input)
    window.addEventListener('focus', onFocus)
    input.click()
  })
}

// Window maximized listeners
const maximizedListeners = new Set<(maximized: boolean) => void>()

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    const isMax = Boolean(document.fullscreenElement)
    maximizedListeners.forEach((cb) => {
      try {
        cb(isMax)
      } catch (e) {
        console.error(e)
      }
    })
  })
}

export const webApi = {
  runtime: 'web' as const,
  fetchKlines: fetchKlinesResult,
  mtBridgeStart: async (): Promise<MtBridgeStatusResult> => ({
    ...webMtStatus(false),
    error: MT_WEB_DISABLED
  }),
  mtBridgeStop: async (): Promise<MtBridgeStatusResult> => webMtStatus(),
  mtBridgeStatus: async (): Promise<MtBridgeStatusResult> => webMtStatus(),
  mtBridgePreview: async (): Promise<MtPreviewLoadResult> => ({
    ok: false,
    error: MT_WEB_DISABLED
  }),
  onMtBridgeEvent:
    (_callback: (payload: MtBridgeIpcEvent) => void): (() => void) =>
    () => {},
  getAppVersion: async (): Promise<string> => __APP_VERSION__,
  minimizeWindow: (): void => {
    // Web fallback: no-op
  },
  toggleMaximizeWindow: (): void => {
    if (typeof document === 'undefined') return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  },
  closeWindow: (): void => {
    // Web fallback: no-op
  },
  isWindowMaximized: async (): Promise<boolean> => {
    return typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  },
  onWindowMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
    maximizedListeners.add(callback)
    return () => {
      maximizedListeners.delete(callback)
    }
  },
  openImportDialog: promptCsvFileInput,
  readImportFile: async (path: string): Promise<ImportReadResult> => {
    const cached = pendingFileCache.get(path)
    if (cached) {
      return { ok: true, content: cached.content, fileName: cached.fileName }
    }
    const sourceRecord = await idbGet<{ id: string; content: string }>('sources', path)
    if (sourceRecord) {
      return { ok: true, content: sourceRecord.content, fileName: 'imported.csv' }
    }
    return { ok: false, error: 'File content not found' }
  },
  saveDataset,
  listDatasets,
  loadDataset,
  deleteDataset,
  checkForUpdates: async () => ({
    ok: true,
    skipped: true,
    version: null
  }),
  downloadUpdate: async () => ({ ok: true }),
  installUpdate: async () => ({ ok: true }),
  onUpdateAvailable: (_cb: (info: UpdateAvailableInfo) => void) => () => {},
  onUpdateProgress: (_cb: (info: UpdateProgressInfo) => void) => () => {},
  onUpdateDownloaded: (_cb: (info: UpdateDownloadedInfo) => void) => () => {},
  onUpdateError: (_cb: (info: UpdateErrorInfo) => void) => () => {}
} satisfies EasyCandleApi

export const webElectron = {
  ipcRenderer: {
    send: () => {},
    invoke: async () => {},
    on: () => {},
    removeListener: () => {}
  }
}

// Inject only when preload did not already expose the desktop API.
if (typeof window !== 'undefined') {
  const w = window as unknown as { api?: typeof webApi; electron?: typeof webElectron }
  if (!w.api) w.api = webApi
  if (!w.electron) w.electron = webElectron
}
