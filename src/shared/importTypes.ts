import type { Candle } from './candleUtils'

export type DataSource = 'binance' | 'imported'

export type ImportedTimeframeStats = {
  candleCount: number
  firstTime: number
  lastTime: number
}

export type ImportedDatasetMeta = {
  id: string
  symbol: string
  /** Source export timeframe — always 1m for new imports. */
  sourceTimeframe: string
  /** Active / last-loaded timeframe for this dataset. */
  timeframe: string
  originalFileName: string
  /** 1m candle count (primary coverage metric). */
  candleCount: number
  firstTime: number
  lastTime: number
  /** Per-timeframe stats for all stored series (1m + derived). */
  timeframes: Record<string, ImportedTimeframeStats>
  createdAt: string
  updatedAt: string
}

export type ImportParseSuccess = {
  ok: true
  candles: Candle[]
  /** Null when the file name did not contain a usable symbol. */
  symbol: string | null
  /** Always 1m on success. */
  timeframe: string
  /** Dominant bar size inferred from candle spacing (always 1m on success). */
  inferredTimeframe: string
  symbolFromFilename: boolean
  timeframeFromFilename: boolean
  warnings: string[]
}

export type ImportParseFailure = {
  ok: false
  error: string
}

export type ImportParseResult = ImportParseSuccess | ImportParseFailure

export type ImportDialogResult =
  | { ok: true; canceled?: false; path: string; fileName: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string }

export type ImportReadResult =
  | { ok: true; content: string; fileName: string }
  | { ok: false; error: string }

export type ImportSaveParams = {
  content: string
  originalFileName: string
  symbol: string
  /** All stored timeframes keyed by id (must include 1m). */
  candlesByTimeframe: Record<string, Candle[]>
  replaceId?: string
}

export type ImportSaveResult =
  | { ok: true; meta: ImportedDatasetMeta; updated: boolean }
  | { ok: false; error: string }

export type ImportListResult =
  | { ok: true; imports: ImportedDatasetMeta[] }
  | { ok: false; error: string }

export type ImportLoadResult =
  | { ok: true; meta: ImportedDatasetMeta; candles: Candle[] }
  | { ok: false; error: string }

export type ImportDeleteResult = { ok: true } | { ok: false; error: string }

/** Compare two 1m series: true when `incoming` has bars after `existing` last open. */
export function hasNewerCandles(existing: Candle[], incoming: Candle[]): boolean {
  if (!incoming.length) return false
  if (!existing.length) return true
  const existingLast = existing[existing.length - 1]?.time ?? 0
  const incomingLast = incoming[incoming.length - 1]?.time ?? 0
  return incomingLast > existingLast
}
