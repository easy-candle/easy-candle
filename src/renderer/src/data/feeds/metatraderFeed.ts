import type { Candle } from '@shared/candleUtils'
import { mtDatasetId } from '@shared/mtBridgeProtocol'
import type { MtBridgeIpcEvent } from '@shared/mtBridgeTypes'
import type {
  CandleFeed,
  DataSourceRef,
  FeedCapabilities,
  FeedPageQuery
} from '@shared/datasource/types'
import type { ImportedDatasetMeta, ImportLoadedWindow } from '@shared/importTypes'
import type { ImportLoadTransport } from './datasetFeed'
import { DatasetFeed } from './datasetFeed'

export type MtBridgeEventTransport = (callback: (event: MtBridgeIpcEvent) => void) => () => void

/** Desktop/browser boundary over `window.api` (IPC events; no-op on web). */
export function ipcMtBridgeEvents(callback: (event: MtBridgeIpcEvent) => void): () => void {
  return window.api.onMtBridgeEvent(callback)
}

const capabilities: FeedCapabilities = { live: true, boundedHistory: true, rangeQuery: true }

/**
 * Live MetaTrader feed = persisted M1 dataset (history) + EA bar stream (live).
 * History pages come from the stored dataset; subscribeLive delivers confirmed
 * bars pushed by the bridge while it is connected.
 */
export class MetatraderFeed implements CandleFeed {
  readonly ref: DataSourceRef
  readonly capabilities = capabilities

  private readonly symbol: string
  private readonly dataset: DatasetFeed
  private readonly events: MtBridgeEventTransport
  private listeners = new Set<(candle: Candle) => void>()
  private unsubscribeEvents: (() => void) | null = null

  constructor(options: {
    symbol: string
    transport?: ImportLoadTransport
    eventTransport?: MtBridgeEventTransport
  }) {
    this.symbol = options.symbol.trim().toUpperCase()
    this.ref = { kind: 'live', symbol: this.symbol }
    this.dataset = new DatasetFeed({ id: mtDatasetId(this.symbol), transport: options.transport })
    this.events = options.eventTransport ?? ipcMtBridgeEvents
  }

  getMeta(): ImportedDatasetMeta | null {
    return this.dataset.getMeta()
  }

  getWindow(): ImportLoadedWindow | null {
    return this.dataset.getWindow()
  }

  getPage(query: FeedPageQuery): Promise<Candle[]> {
    return this.dataset.getPage(query)
  }

  subscribeLive(callback: (candle: Candle) => void): () => void {
    this.listeners.add(callback)
    if (!this.unsubscribeEvents) {
      this.unsubscribeEvents = this.events((event) => this.onEvent(event))
    }

    return () => {
      this.listeners.delete(callback)
      if (this.listeners.size === 0) this.detachEvents()
    }
  }

  dispose(): void {
    this.listeners.clear()
    this.detachEvents()
  }

  private detachEvents(): void {
    if (this.unsubscribeEvents) {
      this.unsubscribeEvents()
      this.unsubscribeEvents = null
    }
  }

  private onEvent(event: MtBridgeIpcEvent): void {
    if (event.type !== 'bar') return
    if (event.symbol.trim().toUpperCase() !== this.symbol) return
    for (const listener of [...this.listeners]) listener(event.candle)
  }
}
