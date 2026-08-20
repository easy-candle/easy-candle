import type { Candle } from './candleUtils'
import type { ImportedDatasetMeta } from './importTypes'
import { MT_BRIDGE_DEFAULT_PORT } from './mtBridgeProtocol'
import type { MtPreviewSummary } from './mtPreview'

export type { MtPreviewSummary }

export type MtBridgeConnectionStatus = {
  listening: boolean
  port: number
  connected: boolean
  error?: string
  symbol?: string
  timeframe?: string
  datasetId?: string
  preview?: MtPreviewSummary
}

export type MtPreviewLoadResult =
  | { ok: true; symbol: string; candles: Candle[] }
  | { ok: false; error: string }

export type MtBridgeStatusResult = MtBridgeConnectionStatus & {
  ok: boolean
}

export type MtBridgeIpcEvent =
  | ({ type: 'status' } & MtBridgeConnectionStatus)
  | { type: 'hello'; symbol: string; timeframe: string; datasetId: string }
  | { type: 'preview'; preview: MtPreviewSummary }
  | { type: 'dataset'; meta: ImportedDatasetMeta; candles1m: Candle[] }
  | { type: 'bar'; datasetId: string; symbol: string; timeframe: string; candle: Candle }
  | { type: 'disconnected' }
  | { type: 'error'; message: string }

export const DEFAULT_MT_BRIDGE_STATUS: MtBridgeConnectionStatus = {
  listening: false,
  port: MT_BRIDGE_DEFAULT_PORT,
  connected: false
}
