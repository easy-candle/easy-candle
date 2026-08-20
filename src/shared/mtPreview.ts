import { mergeCandlesByTime, type Candle } from './candleUtils'

export type MtPreviewState = {
  symbol: string
  candles: Candle[]
}

export type MtPreviewSummary = {
  symbol: string
  candleCount: number
  firstTime: number
  lastTime: number
}

export function summarizeMtPreview(state: MtPreviewState | null | undefined): MtPreviewSummary | null {
  if (!state?.symbol || !state.candles.length) return null
  const first = state.candles[0]
  const last = state.candles[state.candles.length - 1]
  return {
    symbol: state.symbol,
    candleCount: state.candles.length,
    firstTime: first?.time ?? 0,
    lastTime: last?.time ?? 0
  }
}

/** Replace the preview when the EA symbol changes; otherwise merge by time. */
export function applyMtPreviewState(
  state: MtPreviewState | null,
  symbol: string,
  incoming: Candle[]
): MtPreviewState {
  const nextSymbol = String(symbol || '').trim().toUpperCase()
  const base = state && state.symbol === nextSymbol ? state.candles : []
  return {
    symbol: nextSymbol,
    candles: mergeCandlesByTime(base, incoming)
  }
}
