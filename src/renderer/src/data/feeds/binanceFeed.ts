import { clampKlineLimit } from '@shared/candleUtils'
import {
  DataSourceError,
  dataSourceErrorKindFromStatus,
  toDataSourceError
} from '@shared/datasource/errors'
import { pageBackwards, pageRange, type FeedPageBase } from '@shared/datasource/paging'
import type {
  CandleFeed,
  DataSourceRef,
  FeedCapabilities,
  FeedPageQuery
} from '@shared/datasource/types'
import type { KlinesFetchParams, KlinesFetchResult } from '@shared/klinesTypes'
import type { Candle } from '@shared/candleUtils'

export type KlinesTransport = (params: KlinesFetchParams) => Promise<KlinesFetchResult>

/** Desktop/browser boundary: IPC in Electron, direct fetch under `window.api` on web. */
export function ipcKlinesTransport(params: KlinesFetchParams): Promise<KlinesFetchResult> {
  return window.api.fetchKlines(params)
}

const capabilities: FeedCapabilities = { live: false, boundedHistory: false, rangeQuery: true }

const PAGE_LIMIT_FALLBACK = 1000
const DEFAULT_HISTORY_PAGES = 2
const MAX_HISTORY_PAGES = 5
const MAX_RANGE_PAGES = 8

/**
 * Query-based history feed backed by Binance klines. Bounds are candle-open UTC
 * seconds at the contract edge and are converted to milliseconds here.
 */
export class BinanceFeed implements CandleFeed {
  readonly ref: DataSourceRef = { kind: 'binance' }
  readonly capabilities = capabilities

  private readonly transport: KlinesTransport

  constructor(transport: KlinesTransport = ipcKlinesTransport) {
    this.transport = transport
  }

  async getPage(query: FeedPageQuery): Promise<Candle[]> {
    const request: KlinesFetchParams = {
      symbol: query.symbol.toUpperCase(),
      interval: query.timeframe,
      limit: clampKlineLimit(query.limit, PAGE_LIMIT_FALLBACK)
    }

    if (query.startTime != null) request.startTime = Math.floor(query.startTime * 1000)
    if (query.endTime != null) request.endTime = Math.floor(query.endTime * 1000)

    let result: KlinesFetchResult
    try {
      result = await this.transport(request)
    } catch (err) {
      throw toDataSourceError(err, 'Failed to reach the data source')
    }

    if (!result.ok) {
      throw new DataSourceError(
        dataSourceErrorKindFromStatus(result.status),
        result.error || `Failed to load candles (${result.status})`,
        result.detail
      )
    }

    return Array.isArray(result.candles) ? result.candles : []
  }

  /** Paginate backwards from `endTimeSeconds` (default: newest bars). */
  getHistory(
    base: FeedPageBase,
    opts?: { pages?: number; endTimeSeconds?: number }
  ): Promise<Candle[]> {
    return pageBackwards(this, base, {
      pages: opts?.pages ?? DEFAULT_HISTORY_PAGES,
      maxPages: MAX_HISTORY_PAGES,
      ...(opts?.endTimeSeconds != null ? { endTimeSeconds: opts.endTimeSeconds } : {})
    })
  }

  /** Fetch candles covering `[startTimeSeconds, endTimeSeconds]`, paging forward. */
  getRange(
    base: FeedPageBase,
    range: { startTimeSeconds: number; endTimeSeconds: number }
  ): Promise<Candle[]> {
    return pageRange(this, base, { ...range, maxPages: MAX_RANGE_PAGES })
  }
}
