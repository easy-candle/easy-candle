/** Display digits for the chart price scale and OHLC / trade labels. */

export const DEFAULT_PRICE_PRECISION = 2
export const MAX_PRICE_PRECISION = 8

const SAMPLE_LIMIT = 400

/** ISO 4217 codes used as FX bases/quotes (not crypto tickers). */
const FOREX_CURRENCIES = new Set([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'AUD',
  'NZD',
  'CAD',
  'SEK',
  'NOK',
  'DKK',
  'SGD',
  'HKD',
  'TRY',
  'ZAR',
  'MXN',
  'PLN',
  'CNH',
  'CNY',
  'HUF',
  'CZK',
  'THB',
  'INR',
  'KRW',
  'ILS',
  'AED',
  'SAR',
  'RUB',
  'BRL'
])

const METAL_BASES = new Set(['XAU', 'XAG', 'XPT', 'XPD'])

/** Units in 1.0 lot. Crypto stays 1 coin per amount. */
export const FOREX_CONTRACT_SIZE = 100_000
export const GOLD_CONTRACT_SIZE = 100
export const SILVER_CONTRACT_SIZE = 5_000
export const UNIT_CONTRACT_SIZE = 1

export type ContractSizeKind = 'forex' | 'metal' | 'unit'
export type TradeSizeKind = 'lot' | 'amount'

export type ContractSizeInfo = {
  contractSize: number
  kind: ContractSizeKind
  /** Short hint for import confirm / settings, e.g. `Forex standard lot`. */
  label: string
}

export type OhlcLike = {
  open: number
  high: number
  low: number
  close: number
}

export type ChartPriceFormat = {
  type: 'price'
  precision: number
  minMove: number
}

export function clampPricePrecision(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PRICE_PRECISION
  return Math.min(MAX_PRICE_PRECISION, Math.max(0, Math.round(value)))
}

export function minMoveFromPrecision(precision: number): number {
  const digits = clampPricePrecision(precision)
  if (digits === 0) return 1
  return Number(`1e-${digits}`)
}

export function toChartPriceFormat(precision: number): ChartPriceFormat {
  const digits = clampPricePrecision(precision)
  return {
    type: 'price',
    precision: digits,
    minMove: minMoveFromPrecision(digits)
  }
}

export function formatAssetPrice(value: number, precision: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(clampPricePrecision(precision))
}

/** Letters/digits only, uppercased — `EUR/USD`, `EURUSD.a`, `btcusdt`. */
export function normalizeSymbolKey(symbol: string): string {
  return String(symbol || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function parseInstrumentPair(symbol: string): { base: string; quote: string } | null {
  const raw = normalizeSymbolKey(symbol)
  if (raw.length < 6) return null
  return {
    base: raw.slice(0, 3),
    quote: raw.slice(3, 6)
  }
}

/**
 * Known instrument digits, or `null` to infer from OHLC.
 * FX majors/minors: 5 (3 when JPY is the quote). Metals: XAU 2, others 3.
 */
export function precisionForSymbol(symbol: string): number | null {
  const pair = parseInstrumentPair(symbol)
  if (!pair) return null

  if (METAL_BASES.has(pair.base) && FOREX_CURRENCIES.has(pair.quote)) {
    return pair.base === 'XAU' ? 2 : 3
  }

  if (FOREX_CURRENCIES.has(pair.base) && FOREX_CURRENCIES.has(pair.quote)) {
    return pair.quote === 'JPY' ? 3 : 5
  }

  return null
}

/**
 * Units per 1.0 lot (or per 1.0 amount for crypto).
 * FX 100,000; gold 100 oz; silver 5,000 oz; crypto 1 coin.
 */
export function contractSizeInfoForSymbol(symbol: string): ContractSizeInfo {
  const pair = parseInstrumentPair(symbol)
  if (pair) {
    if (METAL_BASES.has(pair.base) && FOREX_CURRENCIES.has(pair.quote)) {
      if (pair.base === 'XAU') {
        return {
          contractSize: GOLD_CONTRACT_SIZE,
          kind: 'metal',
          label: 'Gold standard lot (100 oz)'
        }
      }
      if (pair.base === 'XAG') {
        return {
          contractSize: SILVER_CONTRACT_SIZE,
          kind: 'metal',
          label: 'Silver standard lot (5,000 oz)'
        }
      }
      return {
        contractSize: UNIT_CONTRACT_SIZE,
        kind: 'metal',
        label: '1 oz'
      }
    }
    if (FOREX_CURRENCIES.has(pair.base) && FOREX_CURRENCIES.has(pair.quote)) {
      return {
        contractSize: FOREX_CONTRACT_SIZE,
        kind: 'forex',
        label: 'Forex standard lot'
      }
    }
  }
  return {
    contractSize: UNIT_CONTRACT_SIZE,
    kind: 'unit',
    label: '1 unit'
  }
}

/** Forex/metals trade in lots; crypto trades an amount of the coin. */
export function tradeSizeKindForSymbol(symbol: string): TradeSizeKind {
  return contractSizeInfoForSymbol(symbol).kind === 'unit' ? 'amount' : 'lot'
}

export function contractSizeForSymbol(symbol: string): number {
  return contractSizeInfoForSymbol(symbol).contractSize
}

export function formatContractSize(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US')
}

/** Trailing-zero-stripped decimal count, capped so float noise cannot inflate it. */
export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0
  const text = value.toFixed(MAX_PRICE_PRECISION)
  const trimmed = text.replace(/0+$/, '').replace(/\.$/, '')
  const dot = trimmed.indexOf('.')
  return dot === -1 ? 0 : trimmed.length - dot - 1
}

export function inferPrecisionFromPrices(prices: Iterable<number>): number {
  let max = 0
  for (const price of prices) {
    const digits = decimalPlaces(price)
    if (digits > max) max = digits
    if (max >= MAX_PRICE_PRECISION) return MAX_PRICE_PRECISION
  }
  return max
}

export function inferPrecisionFromCandles(candles: readonly OhlcLike[]): number {
  if (!candles.length) return DEFAULT_PRICE_PRECISION

  const sample =
    candles.length <= SAMPLE_LIMIT ? candles : candles.slice(candles.length - SAMPLE_LIMIT)

  let max = 0
  for (const candle of sample) {
    max = Math.max(
      max,
      decimalPlaces(candle.open),
      decimalPlaces(candle.high),
      decimalPlaces(candle.low),
      decimalPlaces(candle.close)
    )
    if (max >= MAX_PRICE_PRECISION) return MAX_PRICE_PRECISION
  }
  return max
}

/**
 * Prefer the instrument convention (EURUSD stays 5 even on round prints).
 * Crypto and unknown tickers use observed OHLC digits, with the chart default
 * of 2 when there is nothing to measure.
 */
export function resolvePricePrecision(symbol: string, candles?: readonly OhlcLike[] | null): number {
  const fromSymbol = precisionForSymbol(symbol)
  if (fromSymbol != null) return fromSymbol

  if (candles && candles.length > 0) {
    return inferPrecisionFromCandles(candles)
  }

  return DEFAULT_PRICE_PRECISION
}
