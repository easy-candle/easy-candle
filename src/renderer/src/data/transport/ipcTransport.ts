import type { DatasetLoadRange } from '@shared/datasetTypes'
import type { KlinesFetchParams } from '@shared/klinesTypes'
import type { MtBridgeIpcEvent } from '@shared/mtBridgeTypes'
import type { FeedTransports } from './types'

/**
 * Desktop wiring: every call crosses the context bridge into the Electron
 * main process (klines HTTP + filesystem imports + MT bridge events).
 */
export const ipcTransports: FeedTransports = {
  fetchKlines: (params: KlinesFetchParams) => window.api.fetchKlines(params),
  loadDataset: (id: string, timeframe?: string, range?: DatasetLoadRange) =>
    window.api.loadDataset(id, timeframe, range),
  onMtBridgeEvent: (callback: (event: MtBridgeIpcEvent) => void) =>
    window.api.onMtBridgeEvent(callback)
}
