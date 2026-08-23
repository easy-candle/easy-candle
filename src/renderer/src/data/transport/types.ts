import type { KlinesTransport } from '../feeds/binanceFeed'
import type { ImportLoadTransport } from '../feeds/datasetFeed'
import type { MtBridgeEventTransport } from '../feeds/metatraderFeed'

/** Backend seams a CandleFeed needs; each runtime provides its own bundle. */
export type FeedTransports = {
  fetchKlines: KlinesTransport
  loadImport: ImportLoadTransport
  onMtBridgeEvent: MtBridgeEventTransport
}
