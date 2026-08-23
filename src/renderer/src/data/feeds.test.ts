import { describe, expect, it, vi } from 'vitest'
import { BinanceFeed } from './feeds/binanceFeed'
import { DatasetFeed } from './feeds/datasetFeed'
import { MetatraderFeed } from './feeds/metatraderFeed'
import { feeds } from './feeds'

describe('feeds registry', () => {
  it('reuses one instance per ref', () => {
    const binance = feeds.resolve({ kind: 'binance' })
    expect(feeds.resolve({ kind: 'binance' })).toBe(binance)

    const dataset = feeds.resolve({ kind: 'dataset', id: 'ds-1' })
    expect(feeds.resolve({ kind: 'dataset', id: 'ds-1' })).toBe(dataset)
    expect(feeds.resolve({ kind: 'dataset', id: 'ds-2' })).not.toBe(dataset)
  })

  it('creates the right implementation per kind', () => {
    expect(feeds.resolve({ kind: 'binance' })).toBeInstanceOf(BinanceFeed)
    expect(feeds.resolve({ kind: 'dataset', id: 'x' })).toBeInstanceOf(DatasetFeed)
    expect(feeds.resolve({ kind: 'live', symbol: 'XAUUSD' })).toBeInstanceOf(MetatraderFeed)
  })

  it('keys live feeds case-insensitively by symbol', () => {
    expect(feeds.resolve({ kind: 'live', symbol: 'eurusd' })).toBe(
      feeds.resolve({ kind: 'live', symbol: 'EURUSD' })
    )
  })

  it('release disposes and the next resolve builds a fresh feed', () => {
    const ref = { kind: 'live', symbol: 'GBPUSD' } as const
    const first = feeds.resolve(ref)
    const disposeSpy = vi.spyOn(first as MetatraderFeed, 'dispose')

    feeds.release(ref)
    expect(disposeSpy).toHaveBeenCalledTimes(1)
    expect(feeds.resolve(ref)).not.toBe(first)
  })
})
