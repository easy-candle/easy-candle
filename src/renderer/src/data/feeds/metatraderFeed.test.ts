import { describe, expect, it, vi } from 'vitest'
import type { Candle } from '@shared/candleUtils'
import type { MtBridgeIpcEvent } from '@shared/mtBridgeTypes'
import type { ImportLoadRange, ImportLoadResult } from '@shared/importTypes'
import { MetatraderFeed, type MtBridgeEventTransport } from './metatraderFeed'

function candle(time: number): Candle {
  return { time, open: 1, high: 2, low: 0.5, close: 1.5 }
}

function loadOk(): ImportLoadResult {
  return {
    ok: true,
    meta: {
      id: 'mt-EURUSD',
      symbol: 'EURUSD',
      sourceTimeframe: '1m',
      timeframe: '1m',
      originalFileName: 'MetaTrader EURUSD',
      candleCount: 1,
      firstTime: 100,
      lastTime: 100,
      timeframes: {},
      createdAt: '',
      updatedAt: ''
    },
    candles: [candle(100)]
  }
}

type EventSink = (event: MtBridgeIpcEvent) => void

function eventTransportOf() {
  const sinks = new Set<EventSink>()
  const transport = vi.fn((callback: EventSink) => {
    sinks.add(callback)
    return () => {
      sinks.delete(callback)
    }
  }) as unknown as MtBridgeEventTransport & { mock: { calls: EventSink[][] } }
  return {
    transport,
    emit: (event: MtBridgeIpcEvent) => sinks.forEach((sink) => sink(event)),
    sinkCount: () => sinks.size
  }
}

describe('MetatraderFeed', () => {
  it('binds ref to the uppercased symbol', () => {
    const feed = new MetatraderFeed({
      symbol: 'eurusd',
      eventTransport: eventTransportOf().transport
    })
    expect(feed.ref).toEqual({ kind: 'live', symbol: 'EURUSD' })
    expect(feed.capabilities).toEqual({ live: true, boundedHistory: true, rangeQuery: true })
  })

  it('pages history through the mt-prefixed dataset id', async () => {
    const calls: [string, string | undefined, ImportLoadRange | undefined][] = []
    const feed = new MetatraderFeed({
      symbol: 'EURUSD',
      transport: async (id, timeframe, range) => {
        calls.push([id, timeframe, range])
        return loadOk()
      },
      eventTransport: eventTransportOf().transport
    })

    await feed.getPage({ symbol: 'eurusd', timeframe: '1m', endTime: 300, limit: 10 })

    expect(calls[0][0]).toBe('mt-EURUSD')
    expect(calls[0][2]).toEqual({ endTime: 300, limit: 10 })
    expect(feed.getMeta()?.id).toBe('mt-EURUSD')
  })

  it('streams bars for its own symbol to subscribers', () => {
    const { transport, emit } = eventTransportOf()
    const feed = new MetatraderFeed({ symbol: 'EURUSD', eventTransport: transport })
    const received: number[] = []

    const unsubscribe = feed.subscribeLive!((c) => received.push(c.time))
    emit({
      type: 'bar',
      datasetId: 'mt-EURUSD',
      symbol: 'EURUSD',
      timeframe: '1m',
      candle: candle(100)
    })
    emit({
      type: 'bar',
      datasetId: 'mt-XAUUSD',
      symbol: 'xauusd',
      timeframe: '1m',
      candle: candle(999)
    })
    emit({ type: 'status', listening: true, port: 17321, connected: true })

    expect(received).toEqual([100])

    unsubscribe()
    emit({
      type: 'bar',
      datasetId: 'mt-EURUSD',
      symbol: 'EURUSD',
      timeframe: '1m',
      candle: candle(200)
    })
    expect(received).toEqual([100])
  })

  it('supports multiple subscribers and detaches after the last one leaves', () => {
    const { transport, emit, sinkCount } = eventTransportOf()
    const feed = new MetatraderFeed({ symbol: 'EURUSD', eventTransport: transport })
    const first = vi.fn()
    const second = vi.fn()

    const unsubscribeFirst = feed.subscribeLive!(first)
    const unsubscribeSecond = feed.subscribeLive!(second)
    expect(sinkCount()).toBe(1)

    unsubscribeFirst()
    emit({
      type: 'bar',
      datasetId: 'mt-EURUSD',
      symbol: 'EURUSD',
      timeframe: '1m',
      candle: candle(1)
    })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)

    unsubscribeSecond()
    expect(sinkCount()).toBe(0)

    feed.dispose()
    expect(sinkCount()).toBe(0)
  })
})
