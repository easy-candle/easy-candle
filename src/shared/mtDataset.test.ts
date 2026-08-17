import { describe, expect, it } from 'vitest'
import { mergeCandlesByTime, type Candle } from './candleUtils'
import { isMtDatasetId, mtDatasetId } from './mtBridgeProtocol'
import { isMetatraderImport } from './importTypes'

function bar(time: number, close = 1): Candle {
  return { time, open: close, high: close, low: close, close }
}

describe('mtDatasetId', () => {
  it('builds a stable import id from a broker symbol', () => {
    expect(mtDatasetId('eurusd')).toBe('mt-EURUSD')
    expect(mtDatasetId('XAUUSD.m')).toBe('mt-XAUUSD.M')
    expect(isMtDatasetId('mt-EURUSD')).toBe(true)
    expect(isMtDatasetId('uuid-here')).toBe(false)
  })
})

describe('isMetatraderImport', () => {
  it('detects origin or mt- prefix', () => {
    expect(
      isMetatraderImport({
        id: 'mt-EURUSD',
        symbol: 'EURUSD',
        sourceTimeframe: '1m',
        timeframe: '1m',
        originalFileName: 'MetaTrader EURUSD',
        candleCount: 1,
        firstTime: 1,
        lastTime: 1,
        timeframes: {},
        createdAt: '',
        updatedAt: '',
        origin: 'metatrader'
      })
    ).toBe(true)
  })
})

describe('mergeCandlesByTime', () => {
  it('keeps older bars and lets incoming replace the same open time', () => {
    const existing = [bar(100, 1), bar(160, 2)]
    const incoming = [bar(160, 9), bar(220, 3)]
    expect(mergeCandlesByTime(existing, incoming)).toEqual([bar(100, 1), bar(160, 9), bar(220, 3)])
  })

  it('starts from incoming when disk is empty', () => {
    expect(mergeCandlesByTime([], [bar(100)])).toEqual([bar(100)])
  })
})
