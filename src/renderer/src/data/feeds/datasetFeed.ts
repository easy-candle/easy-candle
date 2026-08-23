import type { Candle } from '@shared/candleUtils'
import { DataSourceError, toDataSourceError } from '@shared/datasource/errors'
import type {
  CandleFeed,
  DataSourceRef,
  FeedCapabilities,
  FeedPageQuery
} from '@shared/datasource/types'
import type {
  ImportLoadRange,
  ImportLoadResult,
  ImportedDatasetMeta,
  ImportLoadedWindow
} from '@shared/importTypes'

export type ImportLoadTransport = (
  id: string,
  timeframe?: string,
  range?: ImportLoadRange
) => Promise<ImportLoadResult>

/** Desktop/browser boundary over `window.api` (IPC or IndexedDB backend). */
export function ipcImportLoadTransport(
  id: string,
  timeframe?: string,
  range?: ImportLoadRange
): Promise<ImportLoadResult> {
  return window.api.loadImport(id, timeframe, range)
}

const capabilities: FeedCapabilities = { live: false, boundedHistory: true, rangeQuery: true }

function classifyLoadError(message: string): DataSourceError['kind'] {
  return /not found|no candles|candle series/i.test(message) ? 'not-found' : 'unknown'
}

/**
 * Finite stored series (CSV / MetaTrader import) served in windows by the
 * host process. Bounds are inclusive UTC seconds on both sides of the contract.
 */
export class DatasetFeed implements CandleFeed {
  readonly ref: DataSourceRef
  readonly capabilities = capabilities

  private readonly id: string
  private readonly transport: ImportLoadTransport
  private meta: ImportedDatasetMeta | null = null
  private lastWindow: ImportLoadedWindow | null = null

  constructor(options: { id: string; transport?: ImportLoadTransport }) {
    this.id = options.id
    this.ref = { kind: 'dataset', id: options.id }
    this.transport = options.transport ?? ipcImportLoadTransport
  }

  /** Meta of the most recent successful load; null before the first page. */
  getMeta(): ImportedDatasetMeta | null {
    return this.meta
  }

  /** Coverage of the most recent page; null when unknown or empty. */
  getWindow(): ImportLoadedWindow | null {
    return this.lastWindow
  }

  async getPage(query: FeedPageQuery): Promise<Candle[]> {
    const range: ImportLoadRange = {}
    if (query.startTime != null) range.startTime = Math.floor(query.startTime)
    if (query.endTime != null) range.endTime = Math.floor(query.endTime)
    if (query.limit != null) range.limit = query.limit

    let result: ImportLoadResult
    try {
      result = await this.transport(this.id, query.timeframe, range)
    } catch (err) {
      throw toDataSourceError(err, 'Failed to load the stored dataset')
    }

    if (!result.ok) {
      throw new DataSourceError(classifyLoadError(result.error), result.error)
    }

    this.meta = result.meta
    this.lastWindow = result.window ?? null

    return Array.isArray(result.candles) ? result.candles : []
  }
}
