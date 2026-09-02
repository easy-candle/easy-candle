import { BinanceUpstreamError, fetchBinanceKlines } from '@shared/binanceFetch'
import { clampKlineLimit, type Candle } from '@shared/candleUtils'
import { IMPORT_STORED_TIMEFRAMES } from '@shared/candleAggregate'
import { buildImportedDatasetMeta } from '@shared/importMeta'
import { isAllowedInterval } from '@shared/timeframes'
import { isAllowedSymbol } from '@shared/symbols'
import { decodeMtTextBuffer } from '@shared/mtTextDecode'
import type { EasyCandleApi } from '../../../preload'
import type {
  ImportDeleteResult,
  ImportDialogResult,
  ImportListResult,
  ImportLoadRange,
  ImportLoadResult,
  ImportParseResult,
  ImportReadResult,
  ImportSaveParams,
  ImportSaveResult,
  ImportedDatasetMeta
} from '@shared/importTypes'
import type { ImportJobProgress } from '@shared/importJobProgress'
import { sliceCandleRange } from '@shared/importRange'
import type { KlinesFetchParams, KlinesFetchResult } from '@shared/klinesTypes'
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
import { webAuthGoogleStart, webAuthLogout, webAuthRedeemCode, webAuthRefresh, webAuthSession } from './webAuth'
import {
  idbDeleteImportDataset,
  idbGet,
  idbGetAll,
  idbPut,
  idbWriteImportDataset
} from './importIdb'
import {
  discardWebImportParse,
  onWebImportProgress,
  parseCsvInWebWorker,
  saveImportInWebWorker
} from './importWorkerClient'

const MT_WEB_DISABLED = 'MetaTrader EA import is only available in the desktop app.'

function webMtStatus(ok = true): MtBridgeStatusResult {
  return { ...DEFAULT_MT_BRIDGE_STATUS, ok }
}

// Fallback in-memory store
const memoryMetas = new Map<string, ImportedDatasetMeta>()
const memoryCandles = new Map<string, Candle[]>()
const memorySources = new Map<string, string>()

// In-flight selected files cache for import modal
const pendingFileCache = new Map<string, { content?: string; file?: File; fileName: string }>()

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'imp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

function rememberDataset(
  meta: ImportedDatasetMeta,
  content: string,
  candlesByTimeframe?: Record<string, Candle[]>
): void {
  memoryMetas.set(meta.id, meta)
  memorySources.set(meta.id, content)
  if (!candlesByTimeframe) return
  for (const tf of IMPORT_STORED_TIMEFRAMES) {
    const series = candlesByTimeframe[tf]
    if (series) memoryCandles.set(`${meta.id}:${tf}`, series)
  }
}

async function parseImportFile(path: string): Promise<ImportParseResult> {
  const cached = pendingFileCache.get(path)
  if (!cached?.file && !cached?.content) {
    return { ok: false, error: 'File content not found' }
  }

  try {
    let bytes: ArrayBuffer
    if (cached.file) {
      bytes = await cached.file.arrayBuffer()
    } else {
      bytes = new TextEncoder().encode(cached.content || '').buffer as ArrayBuffer
    }
    const parsed = await parseCsvInWebWorker(bytes, cached.fileName)
    if (parsed.ok) cached.file = undefined
    return parsed
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read selected file'
    return { ok: false, error: message }
  }
}

async function saveImportDataset(params: ImportSaveParams): Promise<ImportSaveResult> {
  try {
    if (params.parseToken) {
      const saved = await saveImportInWebWorker({ ...params, parseToken: params.parseToken })
      if (saved.ok) {
        memoryMetas.set(saved.meta.id, saved.meta)
      }
      return saved
    }

    const candlesByTimeframe = params.candlesByTimeframe
    const candles1m = candlesByTimeframe?.['1m'] ?? params.candles1m
    if (!candles1m?.length || !candlesByTimeframe) {
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

    const meta = buildImportedDatasetMeta({
      id,
      originalFileName: params.originalFileName,
      symbol: params.symbol,
      candlesByTimeframe,
      createdAt,
      origin: params.origin
    })

    const content = params.content ?? ''
    rememberDataset(meta, content, candlesByTimeframe)
    const wrote = await idbWriteImportDataset({ meta, content, candlesByTimeframe })
    if (!wrote) {
      return { ok: false, error: 'Failed to save import to IndexedDB.' }
    }

    return { ok: true, meta, updated }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save import'
    return { ok: false, error: message }
  }
}

async function listImportDatasets(): Promise<ImportListResult> {
  try {
    let imports = await idbGetAll<ImportedDatasetMeta>('metas')
    if (!imports.length && memoryMetas.size > 0) {
      imports = Array.from(memoryMetas.values())
    }
    imports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return { ok: true, imports }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list imports'
    return { ok: false, error: message }
  }
}

async function loadImportDataset(
  id: string,
  timeframe?: string,
  range?: ImportLoadRange
): Promise<ImportLoadResult> {
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

async function deleteImportDataset(id: string): Promise<ImportDeleteResult> {
  try {
    memoryMetas.delete(id)
    memorySources.delete(id)
    for (const tf of IMPORT_STORED_TIMEFRAMES) {
      memoryCandles.delete(`${id}:${tf}`)
    }
    await idbDeleteImportDataset(id)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete import'
    return { ok: false, error: message }
  }
}

function parseOptionalMs(value: unknown, name: string): { value?: number; error?: string } {
  if (value == null || value === '') return {}
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    return { error: `Invalid ${name}` }
  }
  return { value: Math.floor(n) }
}

async function handleKlinesFetch(params: KlinesFetchParams): Promise<KlinesFetchResult> {
  const symbol = String(params?.symbol || '').toUpperCase()
  const interval = String(params?.interval || '')

  if (!symbol || !isAllowedSymbol(symbol)) {
    return { ok: false, status: 400, error: 'Invalid or unsupported symbol' }
  }

  if (!interval || !isAllowedInterval(interval)) {
    return { ok: false, status: 400, error: 'Invalid or unsupported interval' }
  }

  const startParsed = parseOptionalMs(params.startTime, 'startTime')
  if (startParsed.error) {
    return { ok: false, status: 400, error: startParsed.error }
  }

  const endParsed = parseOptionalMs(params.endTime, 'endTime')
  if (endParsed.error) {
    return { ok: false, status: 400, error: endParsed.error }
  }

  const startTime = startParsed.value
  const endTime = endParsed.value

  if (startTime != null && endTime != null && startTime >= endTime) {
    return { ok: false, status: 400, error: 'startTime must be less than endTime' }
  }

  const limit = clampKlineLimit(params.limit, 500)

  try {
    const { candles } = await fetchBinanceKlines({
      symbol,
      interval,
      startTime,
      endTime,
      limit
    })

    return { ok: true, candles }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream request failed'
    const upstreamStatus =
      err instanceof BinanceUpstreamError
        ? err.status
        : err && typeof err === 'object' && 'status' in err
          ? Number((err as { status?: number }).status)
          : undefined

    let clientMessage = 'Failed to fetch klines from Binance'
    let status = 502

    if (upstreamStatus === 429) {
      clientMessage = 'Binance rate limit reached — try again shortly'
      status = 429
    } else if (upstreamStatus === 418) {
      clientMessage = 'Binance temporarily blocked this IP — try again later'
      status = 503
    } else if (upstreamStatus != null && upstreamStatus >= 400 && upstreamStatus < 500) {
      clientMessage = 'Binance rejected the klines request'
      status = 502
    }

    return {
      ok: false,
      status,
      error: clientMessage,
      detail: message,
      ...(Number.isFinite(upstreamStatus) ? { upstreamStatus } : {})
    }
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
        const tempId = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7)
        pendingFileCache.set(tempId, { file, fileName: file.name })
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
  fetchKlines: handleKlinesFetch,
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
  notifyStartupReady: (): void => {
    // Web has no splash window.
  },
  openImportDialog: promptCsvFileInput,
  parseImportFile,
  discardImportParse: async (token: string): Promise<{ ok: true }> => {
    await discardWebImportParse(token)
    return { ok: true }
  },
  onImportJobProgress: (callback: (progress: ImportJobProgress) => void): (() => void) =>
    onWebImportProgress(callback),
  readImportFile: async (path: string): Promise<ImportReadResult> => {
    const cached = pendingFileCache.get(path)
    if (cached?.content) {
      return { ok: true, content: cached.content, fileName: cached.fileName }
    }
    if (cached?.file) {
      try {
        const buffer = await cached.file.arrayBuffer()
        const content =
          typeof Buffer !== 'undefined'
            ? decodeMtTextBuffer(Buffer.from(buffer))
            : new TextDecoder('utf-8').decode(buffer)
        cached.content = content
        cached.file = undefined
        return { ok: true, content, fileName: cached.fileName }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to read selected file'
        return { ok: false, error: message }
      }
    }
    const sourceRecord = await idbGet<{ id: string; content: string }>('sources', path)
    if (sourceRecord) {
      return { ok: true, content: sourceRecord.content, fileName: 'imported.csv' }
    }
    return { ok: false, error: 'File content not found' }
  },
  saveImport: saveImportDataset,
  listImports: listImportDatasets,
  loadImport: loadImportDataset,
  deleteImport: deleteImportDataset,
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
  onUpdateError: (_cb: (info: UpdateErrorInfo) => void) => () => {},
  authSession: webAuthSession,
  authGoogleStart: webAuthGoogleStart,
  authLogout: webAuthLogout,
  authRefresh: webAuthRefresh,
  authRedeemCode: webAuthRedeemCode
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
