/** Imports must be 1-minute (M1) MetaTrader exports. */
export const IMPORT_SOURCE_TIMEFRAME = '1m'

/** Minimum calendar coverage required for an import. */
export const MIN_IMPORT_DAYS = 10

/**
 * Minimum 1m candle rows for ~10 days of continuous data:
 * 10 days × 24 hours × 60 minutes = 14_400.
 * Gaps (weekends/sessions) still need this many bars of history.
 */
export const MIN_1M_CANDLES_FOR_IMPORT = MIN_IMPORT_DAYS * 24 * 60

export function minImportCandlesMessage(actualCount: number): string {
  return (
    `Import needs at least ${MIN_IMPORT_DAYS} days of 1-minute data ` +
    `(${MIN_1M_CANDLES_FOR_IMPORT.toLocaleString()} candles). ` +
    `Got ${actualCount.toLocaleString()}.`
  )
}
