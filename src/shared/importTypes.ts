import type { Candle } from './candleUtils'

export type DataSource = 'binance' | 'imported'

export type ImportedDatasetMeta = {
  id: string
  symbol: string
  timeframe: string
  originalFileName: string
  candleCount: number
  firstTime: number
  lastTime: number
  createdAt: string
  updatedAt: string
}

export type ImportParseSuccess = {
  ok: true
  candles: Candle[]
  /** Null when the file name did not contain a usable symbol. */
  symbol: string | null
  /** Null when the file name did not contain a usable timeframe. */
  timeframe: string | null
  /** Dominant bar size inferred from candle spacing (always set on success). */
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
  timeframe: string
  candles: Candle[]
  replaceId?: string
}

export type ImportSaveResult =
  | { ok: true; meta: ImportedDatasetMeta }
  | { ok: false; error: string }

export type ImportListResult =
  | { ok: true; imports: ImportedDatasetMeta[] }
  | { ok: false; error: string }

export type ImportLoadResult =
  | { ok: true; meta: ImportedDatasetMeta; content: string }
  | { ok: false; error: string }

export type ImportDeleteResult = { ok: true } | { ok: false; error: string }
