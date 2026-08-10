export type TimeframeConfig = {
  id: string
  label: string
  binanceInterval: string
  seconds: number
}

export const TIMEFRAMES: Record<string, TimeframeConfig> = {
  '1m': { id: '1m', label: '1m', binanceInterval: '1m', seconds: 60 },
  '5m': { id: '5m', label: '5m', binanceInterval: '5m', seconds: 300 },
  '15m': { id: '15m', label: '15m', binanceInterval: '15m', seconds: 900 },
  '1h': { id: '1h', label: '1h', binanceInterval: '1h', seconds: 3600 },
  '4h': { id: '4h', label: '4h', binanceInterval: '4h', seconds: 14400 },
  '1d': { id: '1d', label: '1d', binanceInterval: '1d', seconds: 86400 }
}

export const TIMEFRAME_IDS: string[] = Object.keys(TIMEFRAMES)

export const DEFAULT_TIMEFRAME = '15m'

/** Allowlisted Binance intervals. */
export const ALLOWED_INTERVALS = new Set(
  TIMEFRAME_IDS.map((id) => TIMEFRAMES[id].binanceInterval)
)

export function isAllowedInterval(interval: string): boolean {
  return ALLOWED_INTERVALS.has(String(interval || ''))
}

/**
 * Floor a UTC open time onto the candle open for `intervalSeconds`.
 * Used when remapping the replay playhead across timeframes.
 */
export function alignTimeToInterval(timeSeconds: number, intervalSeconds: number): number {
  const t = Math.floor(Number(timeSeconds))
  const step = Math.max(1, Math.floor(Number(intervalSeconds)) || 1)
  if (!Number.isFinite(t)) return 0
  return Math.floor(t / step) * step
}

/**
 * Last UTC second covered by the candle that opens at `openTimeSeconds`.
 * Used to sync a follower pane so that e.g. one 5m step reveals five 1m bars.
 */
export function playheadCoverEnd(openTimeSeconds: number, intervalSeconds: number): number {
  const open = Math.floor(Number(openTimeSeconds))
  const step = Math.max(1, Math.floor(Number(intervalSeconds)) || 1)
  if (!Number.isFinite(open)) return 0
  return open + step - 1
}

/** Prefer a different TF so split view is useful out of the box. */
export function defaultSecondaryTimeframe(primaryTimeframe: string): string {
  if (primaryTimeframe === '1m') return '5m'
  if (TIMEFRAMES['1m']) return '1m'
  return DEFAULT_TIMEFRAME
}
