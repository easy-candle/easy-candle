import { dataSourceRefKey, type CandleFeed, type DataSourceRef } from '@shared/datasource/types'
import { getFeedTransports } from './transport'
import { BinanceFeed } from './feeds/binanceFeed'
import { DatasetFeed } from './feeds/datasetFeed'
import { MetatraderFeed } from './feeds/metatraderFeed'

const registry = new Map<string, CandleFeed>()

function createFeed(ref: DataSourceRef): CandleFeed {
  const transports = getFeedTransports()
  switch (ref.kind) {
    case 'binance':
      return new BinanceFeed(transports.fetchKlines)
    case 'dataset':
      return new DatasetFeed({ id: ref.id, transport: transports.loadImport })
    case 'live':
      return new MetatraderFeed({ symbol: ref.symbol, eventTransport: transports.onMtBridgeEvent })
  }
}

/**
 * Single entry point the store talks to. Feeds are created lazily per ref and
 * reused until released, so live subscriptions survive across consumers.
 */
export const feeds = {
  resolve(ref: DataSourceRef): CandleFeed {
    const key = dataSourceRefKey(ref)
    const cached = registry.get(key)
    if (cached) return cached

    const feed = createFeed(ref)
    registry.set(key, feed)
    return feed
  },

  /** Detach and drop the feed for a ref; a later resolve builds a fresh one. */
  release(ref: DataSourceRef): void {
    const key = dataSourceRefKey(ref)
    const feed = registry.get(key)
    if (!feed) return
    registry.delete(key)
    feed.dispose?.()
  },

  clear(): void {
    for (const feed of registry.values()) feed.dispose?.()
    registry.clear()
  }
}
