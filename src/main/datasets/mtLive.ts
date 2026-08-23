import { mergeCandlesByTime, type Candle } from '@shared/candleUtils'
import { buildImportTimeframes } from '@shared/candleAggregate'
import { mtDatasetId } from '@shared/mtBridgeProtocol'
import {
  applyMtPreviewState,
  summarizeMtPreview,
  type MtPreviewState,
  type MtPreviewSummary
} from '@shared/mtPreview'
import { isMetatraderImport, type ImportedDatasetMeta } from '@shared/datasetTypes'
import { buildMeta, readCandles, readMeta, writeCandles, writeMeta } from './storage'

const MT_FLUSH_MS = 500

const savedMtBySymbol = new Map<string, string>()

let mtPreview: MtPreviewState | null = null

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

export function rememberSavedMtDataset(meta: ImportedDatasetMeta): void {
  if (!isMetatraderImport(meta)) return
  const symbol = String(meta.symbol || '')
    .trim()
    .toUpperCase()
  if (symbol) savedMtBySymbol.set(symbol, meta.id)
}

export function forgetMtDataset(id: string): void {
  mtMemory.delete(id)
  cancelMtFlush(id)
  for (const [symbol, savedId] of savedMtBySymbol) {
    if (savedId === id) savedMtBySymbol.delete(symbol)
  }
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

function cancelMtFlush(id: string): void {
  const timer = mtFlushTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    mtFlushTimers.delete(id)
  }
}

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
  const meta = buildMeta({
    id,
    symbol: memory.meta.symbol,
    originalFileName: `MetaTrader ${memory.meta.symbol}`,
    candlesByTimeframe,
    createdAt: memory.meta.createdAt,
    activeTimeframe: memory.meta.timeframe,
    origin: 'metatrader'
  })

  await writeCandles(id, candlesByTimeframe)
  await writeMeta(meta)
  memory.meta = meta
  memory.dirty = false
  rememberSavedMtDataset(meta)
  return meta
}

function scheduleMtFlush(id: string): void {
  cancelMtFlush(id)
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
    cancelMtFlush(id)
    const meta = await persistMtMemory(id)
    if (!meta) return { ok: false, error: 'Failed to write MetaTrader dataset.' }
    return { ok: true, persisted: true, meta, candles1m: memory.candles1m }
  }

  scheduleMtFlush(id)
  return { ok: true, persisted: true, meta: memory.meta, candles1m: memory.candles1m }
}

export async function flushAllMtDatasets(): Promise<void> {
  const ids = [...mtMemory.keys()]
  for (const id of ids) {
    cancelMtFlush(id)
    if (mtMemory.get(id)?.dirty) {
      await persistMtMemory(id)
    }
  }
}
