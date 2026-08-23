import type { KlinesTransport } from '../feeds/binanceFeed'
import type { DatasetLoadTransport } from '../feeds/datasetFeed'
import type { MtBridgeEventTransport } from '../feeds/metatraderFeed'

/** Backend seams a CandleFeed needs; each runtime provides its own bundle. */
export type FeedTransports = {
  fetchKlines: KlinesTransport
  loadDataset: DatasetLoadTransport
  onMtBridgeEvent: MtBridgeEventTransport
}
