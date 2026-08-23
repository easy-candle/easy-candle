import type { Candle } from '../candleUtils'

/** Identifies which feed supplies the chart data. */
export type DataSourceRef =
  { kind: 'binance' } | { kind: 'dataset'; id: string } | { kind: 'live'; symbol: string }

export function dataSourceRefKey(ref: DataSourceRef): string {
  switch (ref.kind) {
    case 'binance':
      return 'binance'
    case 'dataset':
      return `dataset:${ref.id}`
    case 'live':
      return `live:${ref.symbol.toUpperCase()}`
  }
}

export type FeedCapabilities = {
  /** Pushes new bars while connected; subscribeLive is available. */
  live: boolean
  /** Series is finite — paging stops at the stored edges. */
  boundedHistory: boolean
  /** Accepts arbitrary [startTime, endTime] windows. */
  rangeQuery: boolean
}

export type FeedPageQuery = {
  symbol: string
  timeframe: string
  /** Inclusive candle-open bound, UTC seconds. */
  startTime?: number
  /** Inclusive candle-open bound, UTC seconds. */
  endTime?: number
  limit?: number
}

/** Uniform contract every data source implements; results are sorted and deduped by `time`. */
export type CandleFeed = {
  readonly ref: DataSourceRef
  readonly capabilities: FeedCapabilities
  getPage(query: FeedPageQuery): Promise<Candle[]>
  subscribeLive?(callback: (candle: Candle) => void): () => void
  dispose?(): void
}
