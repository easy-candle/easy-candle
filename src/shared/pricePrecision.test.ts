import { describe, expect, it } from 'vitest'
import {
  contractSizeForSymbol,
  contractSizeInfoForSymbol,
  decimalPlaces,
  FOREX_CONTRACT_SIZE,
  formatAssetPrice,
  formatContractSize,
  GOLD_CONTRACT_SIZE,
  inferPrecisionFromCandles,
  minMoveFromPrecision,
  precisionForSymbol,
  resolvePricePrecision,
  SILVER_CONTRACT_SIZE,
  toChartPriceFormat,
  tradeSizeKindForSymbol,
  UNIT_CONTRACT_SIZE
} from './pricePrecision'

describe('precisionForSymbol', () => {
  it('uses 5 digits for standard FX pairs', () => {
    expect(precisionForSymbol('EURUSD')).toBe(5)
    expect(precisionForSymbol('eur/usd')).toBe(5)
    expect(precisionForSymbol('GBPUSD')).toBe(5)
    expect(precisionForSymbol('EURUSDm')).toBe(5)
    expect(precisionForSymbol('EURUSD.a')).toBe(5)
  })

  it('uses 3 digits for JPY quotes', () => {
    expect(precisionForSymbol('USDJPY')).toBe(3)
    expect(precisionForSymbol('GBPJPY')).toBe(3)
  })

  it('uses metal conventions', () => {
    expect(precisionForSymbol('XAUUSD')).toBe(2)
    expect(precisionForSymbol('XAGUSD')).toBe(3)
  })

  it('leaves crypto and short names to OHLC inference', () => {
    expect(precisionForSymbol('BTCUSDT')).toBeNull()
    expect(precisionForSymbol('BTC/USDT')).toBeNull()
    expect(precisionForSymbol('ETHUSDT')).toBeNull()
    expect(precisionForSymbol('ADA')).toBeNull()
  })
})

describe('decimalPlaces', () => {
  it('counts significant fraction digits without float inflation', () => {
    expect(decimalPlaces(1.16345)).toBe(5)
    expect(decimalPlaces(150.123)).toBe(3)
    expect(decimalPlaces(67432.12)).toBe(2)
    expect(decimalPlaces(0.4521)).toBe(4)
    expect(decimalPlaces(1.16)).toBe(2)
    expect(decimalPlaces(100)).toBe(0)
  })
})

describe('inferPrecisionFromCandles', () => {
  it('takes the widest OHLC fraction in the sample', () => {
    expect(
      inferPrecisionFromCandles([
        { open: 1.16, high: 1.16345, low: 1.159, close: 1.162 }
      ])
    ).toBe(5)
  })
})

describe('resolvePricePrecision', () => {
  it('keeps FX digits even when prints look round', () => {
    expect(
      resolvePricePrecision('EURUSD', [{ open: 1.16, high: 1.16, low: 1.16, close: 1.16 }])
    ).toBe(5)
  })

  it('infers crypto from OHLC', () => {
    expect(
      resolvePricePrecision('BTCUSDT', [
        { open: 67432.1, high: 67440.55, low: 67400, close: 67432.12 }
      ])
    ).toBe(2)
    expect(
      resolvePricePrecision('ADAUSDT', [
        { open: 0.4521, high: 0.455, low: 0.449, close: 0.45123 }
      ])
    ).toBe(5)
  })

  it('falls back to 2 decimals without a known symbol or candles', () => {
    expect(resolvePricePrecision('BTCUSDT')).toBe(2)
    expect(resolvePricePrecision('')).toBe(2)
  })
})

describe('toChartPriceFormat', () => {
  it('pairs precision with a matching minMove', () => {
    expect(toChartPriceFormat(5)).toEqual({ type: 'price', precision: 5, minMove: 0.00001 })
    expect(toChartPriceFormat(3)).toEqual({ type: 'price', precision: 3, minMove: 0.001 })
    expect(toChartPriceFormat(2)).toEqual({ type: 'price', precision: 2, minMove: 0.01 })
    expect(minMoveFromPrecision(0)).toBe(1)
  })
})

describe('formatAssetPrice', () => {
  it('formats with the resolved digit count', () => {
    expect(formatAssetPrice(1.16345, 5)).toBe('1.16345')
    expect(formatAssetPrice(1.16, 5)).toBe('1.16000')
    expect(formatAssetPrice(67432.1, 2)).toBe('67432.10')
    expect(formatAssetPrice(Number.NaN, 5)).toBe('—')
  })
})

describe('contractSizeForSymbol', () => {
  it('uses a standard lot for FX pairs', () => {
    expect(contractSizeForSymbol('EURUSD')).toBe(FOREX_CONTRACT_SIZE)
    expect(contractSizeForSymbol('eur/usd')).toBe(FOREX_CONTRACT_SIZE)
    expect(contractSizeForSymbol('EURUSD.a')).toBe(FOREX_CONTRACT_SIZE)
    expect(contractSizeForSymbol('USDJPY')).toBe(FOREX_CONTRACT_SIZE)
  })

  it('uses metal and crypto contracts', () => {
    expect(contractSizeForSymbol('XAUUSD')).toBe(GOLD_CONTRACT_SIZE)
    expect(contractSizeForSymbol('XAGUSD')).toBe(SILVER_CONTRACT_SIZE)
    expect(contractSizeForSymbol('BTCUSDT')).toBe(UNIT_CONTRACT_SIZE)
    expect(contractSizeForSymbol('ETHUSD')).toBe(UNIT_CONTRACT_SIZE)
    expect(contractSizeForSymbol('')).toBe(UNIT_CONTRACT_SIZE)
  })

  it('labels kinds for import confirm', () => {
    expect(contractSizeInfoForSymbol('EURUSD')).toEqual({
      contractSize: FOREX_CONTRACT_SIZE,
      kind: 'forex',
      label: 'Forex standard lot'
    })
    expect(contractSizeInfoForSymbol('XAUUSD').label).toBe('Gold standard lot (100 oz)')
    expect(contractSizeInfoForSymbol('BTCUSDT').label).toBe('1 unit')
    expect(formatContractSize(FOREX_CONTRACT_SIZE)).toBe('100,000')
    expect(formatContractSize(1)).toBe('1')
  })

  it('uses lots for FX/metals and amount for crypto', () => {
    expect(tradeSizeKindForSymbol('EURUSD')).toBe('lot')
    expect(tradeSizeKindForSymbol('XAUUSD')).toBe('lot')
    expect(tradeSizeKindForSymbol('BTCUSDT')).toBe('amount')
  })
})
