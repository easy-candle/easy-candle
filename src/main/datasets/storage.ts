import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { Candle } from '@shared/candleUtils'
import { IMPORT_STORED_TIMEFRAMES } from '@shared/candleAggregate'
import { DEFAULT_TIMEFRAME } from '@shared/timeframes'
import type {
  ImportedDatasetMeta,
  ImportedTimeframeStats,
  ImportOrigin
} from '@shared/datasetTypes'

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

export async function ensureImportsRoot(): Promise<void> {
  await fs.mkdir(importsRoot(), { recursive: true })
}

export async function listDatasetDirs(): Promise<string[]> {
  const entries = await fs.readdir(importsRoot(), { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

export async function deleteDatasetDir(id: string): Promise<void> {
  await fs.rm(datasetDir(id), { recursive: true, force: true })
}

export async function readMeta(id: string): Promise<ImportedDatasetMeta | null> {
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

export async function writeMeta(meta: ImportedDatasetMeta): Promise<void> {
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

export function buildMeta(params: {
  id: string
  originalFileName: string
  symbol: string
  candlesByTimeframe: Record<string, Candle[]>
  activeTimeframe?: string
  createdAt?: string
  origin?: ImportOrigin
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
    updatedAt: now,
    ...(params.origin ? { origin: params.origin } : {})
  }
}

export async function writeSource(id: string, content: string): Promise<void> {
  await fs.mkdir(datasetDir(id), { recursive: true })
  await fs.writeFile(sourcePath(id), content, 'utf8')
}

export async function writeCandles(
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

export async function readCandles(id: string, timeframe: string): Promise<Candle[] | null> {
  try {
    const raw = await fs.readFile(candlesPath(id, timeframe), 'utf8')
    const parsed = JSON.parse(raw) as Candle[]
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}
