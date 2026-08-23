import { fetchKlinesResult } from '@shared/klinesService'
import type { DatasetLoadRange } from '@shared/datasetTypes'
import type { MtBridgeIpcEvent } from '@shared/mtBridgeTypes'
import type { FeedTransports } from './types'

/**
 * Browser wiring: klines go straight to the Binance REST endpoints (no IPC
 * hop), dataset windows ride the polyfilled `window.api` bridge (IndexedDB
 * backend) until a native web backend replaces it, and the MT bridge has no
 * browser equivalent.
 */
export const webTransports: FeedTransports = {
  fetchKlines: fetchKlinesResult,
  loadDataset: (id: string, timeframe?: string, range?: DatasetLoadRange) =>
    window.api.loadDataset(id, timeframe, range),
  onMtBridgeEvent: (_callback: (event: MtBridgeIpcEvent) => void) => () => {}
}
