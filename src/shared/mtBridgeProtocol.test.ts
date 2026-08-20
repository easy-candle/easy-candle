import { describe, expect, it } from 'vitest'
import {
  applyLiveBar,
  mapMtTimeframe,
  parseMtBar,
  parseMtBridgeMessage,
  parseMtSymbol
} from './mtBridgeProtocol'

describe('mapMtTimeframe', () => {
  it('maps MetaTrader and app ids to chart timeframes', () => {
    expect(mapMtTimeframe('M1')).toBe('1m')
    expect(mapMtTimeframe('m15')).toBe('15m')
    expect(mapMtTimeframe('H1')).toBe('1h')
    expect(mapMtTimeframe('1h')).toBe('1h')
    expect(mapMtTimeframe('D1')).toBe('1d')
  })

  it('rejects unknown timeframes', () => {
    expect(mapMtTimeframe('M3')).toBeNull()
    expect(mapMtTimeframe('')).toBeNull()
    expect(mapMtTimeframe(5)).toBeNull()
  })
})

describe('parseMtSymbol', () => {
  it('normalizes broker symbols', () => {
    expect(parseMtSymbol('eurusd')).toBe('EURUSD')
    expect(parseMtSymbol('XAUUSD.m')).toBe('XAUUSD.M')
  })

  it('rejects empty or odd symbols', () => {
    expect(parseMtSymbol('')).toBeNull()
    expect(parseMtSymbol('EUR/USD')).toBeNull()
    expect(parseMtSymbol('A'.repeat(33))).toBeNull()
  })
})

describe('parseMtBar', () => {
  it('parses compact OHLC fields', () => {
    expect(parseMtBar({ t: 1723881600, o: 1.1, h: 1.2, l: 1.0, c: 1.15, vol: 10 })).toEqual({
      time: 1723881600,
      open: 1.1,
      high: 1.2,
      low: 1.0,
      close: 1.15,
      volume: 10
    })
  })

  it('converts millisecond timestamps to seconds', () => {
    const candle = parseMtBar({ t: 1723881600000, o: 1, h: 1, l: 1, c: 1 })
    expect(candle?.time).toBe(1723881600)
  })
})

describe('parseMtBridgeMessage', () => {
  it('parses hello, history, bar, and ping', () => {
    const hello = parseMtBridgeMessage(
      JSON.stringify({ v: 1, type: 'hello', symbol: 'EURUSD', tf: 'M1' })
    )
    expect(hello).toEqual({
      ok: true,
      message: { v: 1, type: 'hello', symbol: 'EURUSD', tf: '1m' }
    })

    const history = parseMtBridgeMessage({
      v: 1,
      type: 'history',
      symbol: 'EURUSD',
      tf: 'M1',
      bars: [
        { t: 1723881600, o: 1, h: 1, l: 1, c: 1 },
        { t: 1723881660, o: 1, h: 1, l: 1, c: 1 }
      ]
    })
    expect(history.ok).toBe(true)
    if (history.ok && history.message.type === 'history') {
      expect(history.message.candles).toHaveLength(2)
    }

    const bar = parseMtBridgeMessage({
      v: 1,
      type: 'bar',
      symbol: 'eurusd',
      tf: '1m',
      t: 1723881720,
      o: 1,
      h: 2,
      l: 0.5,
      c: 1.5
    })
    expect(bar.ok).toBe(true)
    if (bar.ok && bar.message.type === 'bar') {
      expect(bar.message.candle.close).toBe(1.5)
    }

    expect(parseMtBridgeMessage({ v: 1, type: 'ping' })).toEqual({
      ok: true,
      message: { v: 1, type: 'ping' }
    })
  })

  it('ignores unknown types and bad payloads', () => {
    expect(parseMtBridgeMessage({ v: 1, type: 'signal' }).ok).toBe(false)
    expect(parseMtBridgeMessage({ v: 2, type: 'hello', symbol: 'EURUSD', tf: 'M1' }).ok).toBe(
      false
    )
    expect(parseMtBridgeMessage('not-json').ok).toBe(false)
    expect(parseMtBridgeMessage({ v: 1, type: 'hello', symbol: 'EURUSD', tf: 'M3' }).ok).toBe(
      false
    )
  })
})

describe('applyLiveBar', () => {
  const first = { time: 100, open: 1, high: 2, low: 0.5, close: 1.5 }

  it('starts a series from an empty buffer', () => {
    expect(applyLiveBar([], first)).toEqual([first])
  })

  it('updates the forming bar in place', () => {
    const next = { ...first, high: 3, close: 2 }
    expect(applyLiveBar([first], next)).toEqual([next])
  })

  it('appends when the open time advances', () => {
    const next = { time: 160, open: 2, high: 2, low: 2, close: 2 }
    expect(applyLiveBar([first], next)).toEqual([first, next])
  })

  it('ignores older bars', () => {
    const older = { time: 40, open: 1, high: 1, low: 1, close: 1 }
    expect(applyLiveBar([first], older)).toEqual([first])
  })
})
