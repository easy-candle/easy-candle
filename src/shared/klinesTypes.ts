import type { Candle } from '@shared/candleUtils'

export type KlinesFetchParams = {
  symbol: string
  interval: string
  startTime?: number
  endTime?: number
  limit?: number
}

export type KlinesFetchSuccess = {
  ok: true
  candles: Candle[]
}

export type KlinesFetchFailure = {
  ok: false
  status: number
  error: string
  detail?: string
  upstreamStatus?: number
}

export type KlinesFetchResult = KlinesFetchSuccess | KlinesFetchFailure
