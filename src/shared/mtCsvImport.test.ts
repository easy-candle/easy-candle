import { describe, expect, it } from 'vitest'
import { inferTimeframeSeconds, parseMtCsv, parseMtFilename } from './mtCsvImport'

function mt4Series(count: number, stepSec: number, start = Date.UTC(2024, 0, 2, 0, 0, 0) / 1000): string {
  const lines = ['Date,Time,Open,High,Low,Close,Volume']
  for (let i = 0; i < count; i += 1) {
    const t = start + i * stepSec
    const d = new Date(t * 1000)
    const date = `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`
    const time = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
    const close = 1.1 + i * 0.0001
    lines.push(`${date},${time},${close - 0.0001},${close + 0.0002},${close - 0.0002},${close},10`)
  }
  return lines.join('\n')
}

describe('parseMtFilename', () => {
  it('parses SYMBOL_PERIOD_range names', () => {
    expect(parseMtFilename('EURUSD_M15_202001010000_202412312359.csv')).toEqual({
      symbol: 'EURUSD',
      timeframe: '15m',
      unsupportedPeriod: null
    })
  })

  it('parses compact minute suffixes', () => {
    expect(parseMtFilename('BTCUSD60.csv')).toEqual({
      symbol: 'BTCUSD',
      timeframe: '1h',
      unsupportedPeriod: null
    })
  })

  it('parses glued MetaTrader periods (XAUUSDM5)', () => {
    expect(parseMtFilename('XAUUSDM5.csv')).toEqual({
      symbol: 'XAUUSD',
      timeframe: '5m',
      unsupportedPeriod: null
    })
    expect(parseMtFilename('EURUSDH1')).toEqual({
      symbol: 'EURUSD',
      timeframe: '1h',
      unsupportedPeriod: null
    })
    expect(parseMtFilename('GBPUSDM15_20240101.csv')).toEqual({
      symbol: 'GBPUSD',
      timeframe: '15m',
      unsupportedPeriod: null
    })
  })

  it('parses underscored and glued styles for the same pair', () => {
    expect(parseMtFilename('XAUUSD_M5.csv')).toMatchObject({
      symbol: 'XAUUSD',
      timeframe: '5m'
    })
    expect(parseMtFilename('XAUUSDM5.csv')).toMatchObject({
      symbol: 'XAUUSD',
      timeframe: '5m'
    })
  })

  it('rejects unsupported periods', () => {
    expect(parseMtFilename('EURUSD_M30.csv').unsupportedPeriod).toBe('M30')
    expect(parseMtFilename('XAUUSDM30.csv').unsupportedPeriod).toBe('M30')
  })
})

describe('parseMtCsv', () => {
  it('parses MT4 CSV and validates timeframe against content', () => {
    const content = mt4Series(20, 900)
    const result = parseMtCsv(content, 'EURUSD_M15.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.symbol).toBe('EURUSD')
    expect(result.timeframe).toBe('15m')
    expect(result.candles).toHaveLength(20)
    expect(inferTimeframeSeconds(result.candles)).toBe(900)
  })

  it('parses MT5-style combined datetime rows', () => {
    const lines = [
      '<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>',
      '2024.01.02\t00:00:00\t100\t101\t99\t100.5\t12\t0\t1',
      '2024.01.02\t01:00:00\t100.5\t102\t100\t101\t8\t0\t1',
      '2024.01.02\t02:00:00\t101\t103\t100.5\t102\t9\t0\t1'
    ]
    const result = parseMtCsv(lines.join('\n'), 'XAUUSD_H1.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeframe).toBe('1h')
    expect(result.candles).toHaveLength(3)
  })

  it('parses MT5 combined datetime with tab-separated OHLC (no header)', () => {
    const lines = [
      '2025.03.05 02:00\t2914.37\t2914.4\t2912.33\t2913.35\t305\t0',
      '2025.03.05 02:05\t2913.35\t2914.35\t2912.26\t2914.24\t405\t0',
      '2025.03.05 02:10\t2914.24\t2915.12\t2913.91\t2914.21\t411\t0',
      '2025.03.05 02:15\t2914.21\t2915.6\t2914.01\t2915.38\t325\t0',
      '2025.03.05 02:20\t2915.38\t2915.97\t2914.99\t2915.52\t341\t0'
    ]
    const result = parseMtCsv(lines.join('\n'), 'XAUUSD_M5_20250305.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.symbol).toBe('XAUUSD')
    expect(result.timeframe).toBe('5m')
    expect(result.candles).toHaveLength(5)
    expect(result.candles[0]).toMatchObject({
      open: 2914.37,
      high: 2914.4,
      low: 2912.33,
      close: 2913.35
    })
  })

  it('parses space-separated MT5 rows', () => {
    const lines = [
      '2025.03.05 02:00 2914.37 2914.4 2912.33 2913.35 305 0',
      '2025.03.05 02:05 2913.35 2914.35 2912.26 2914.24 405 0',
      '2025.03.05 02:10 2914.24 2915.12 2913.91 2914.21 411 0'
    ]
    const result = parseMtCsv(lines.join('\n'), 'XAUUSD_M5.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeframe).toBe('5m')
    expect(result.candles).toHaveLength(3)
  })

  it('parses semicolon European-decimal exports', () => {
    const lines = [
      '2024.01.02 00:00;100,10;101,20;99,50;100,80;12;0',
      '2024.01.02 01:00;100,80;102,00;100,00;101,10;8;0',
      '2024.01.02 02:00;101,10;103,00;100,50;102,00;9;0'
    ]
    const result = parseMtCsv(lines.join('\n'), 'EURUSD_H1.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candles[0].open).toBeCloseTo(100.1, 5)
  })

  it('recovers from UTF-16 LE text that still contains NULs', () => {
    const utf16 = Buffer.from(
      '2025.03.05 02:00\t2914.37\t2914.4\t2912.33\t2913.35\t305\t0\n' +
        '2025.03.05 02:05\t2913.35\t2914.35\t2912.26\t2914.24\t405\t0\n' +
        '2025.03.05 02:10\t2914.24\t2915.12\t2913.91\t2914.21\t411\t0\n',
      'utf16le'
    ).toString('latin1')
    const result = parseMtCsv(utf16, 'XAUUSD_M5.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candles.length).toBeGreaterThanOrEqual(3)
  })

  it('fails when filename timeframe disagrees with candle spacing', () => {
    const content = mt4Series(20, 900)
    const result = parseMtCsv(content, 'EURUSD_H1.csv')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/file name suggests timeframe 1h/i)
  })

  it('allows missing symbol in file name for modal confirmation', () => {
    const content = mt4Series(10, 60)
    const result = parseMtCsv(content, 'history.csv')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.symbol).toBeNull()
    expect(result.symbolFromFilename).toBe(false)
    expect(result.inferredTimeframe).toBe('1m')
    expect(result.timeframeFromFilename).toBe(false)
  })
})
