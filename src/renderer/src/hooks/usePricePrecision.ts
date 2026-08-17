import { useMemo } from 'react'
import { resolvePricePrecision } from '@shared/pricePrecision'
import { useReplayStore } from '@/store/replayStore'

/** Price-scale digits for the active symbol (FX convention or inferred OHLC). */
export function usePricePrecision(): number {
  const symbol = useReplayStore((s) => s.symbol)
  const candles = useReplayStore((s) => s.candles)
  return useMemo(() => resolvePricePrecision(symbol, candles), [symbol, candles])
}
