import { describe, expect, it } from 'vitest'
import { MIN_1M_CANDLES_FOR_IMPORT } from './importConstants'
import { parseImportBytes, buildImportTimeframesJob, clientParseResult } from './importWorkerJob'
import { parseMtCsv } from './mtCsvImport'

function mt4Series(
  count: number,
  stepSec: number,
  start = Date.UTC(2024, 0, 2, 0, 0, 0) / 1000
): string {
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

describe('importWorkerJob', () => {
  it('parses bytes the same as parseMtCsv and reports parse progress', () => {
    const content = mt4Series(MIN_1M_CANDLES_FOR_IMPORT, 60)
    const bytes = new TextEncoder().encode(content).buffer
    const jobs: string[] = []
    const { result, content: decoded } = parseImportBytes(bytes, 'EURUSD_M1.csv', (progress) => {
      jobs.push(progress.job)
    })
    expect(decoded).toContain('Date,Time,Open')
    expect(result).toEqual(parseMtCsv(content, 'EURUSD_M1.csv'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candleCount).toBe(MIN_1M_CANDLES_FOR_IMPORT)
    expect(jobs).toContain('parse')
  })

  it('strips candles from the client parse result and keeps stats', () => {
    const content = mt4Series(MIN_1M_CANDLES_FOR_IMPORT, 60)
    const parsed = parseMtCsv(content, 'EURUSD_M1.csv')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const client = clientParseResult(parsed, 'token-1')
    expect(client.ok).toBe(true)
    if (!client.ok) return
    expect(client.candles).toEqual([])
    expect(client.parseToken).toBe('token-1')
    expect(client.candleCount).toBe(parsed.candleCount)
    expect(client.firstTime).toBe(parsed.firstTime)
    expect(client.lastTime).toBe(parsed.lastTime)
  })

  it('builds timeframes in one linear cascade with UI percents', () => {
    const content = mt4Series(MIN_1M_CANDLES_FOR_IMPORT, 60)
    const parsed = parseMtCsv(content, 'EURUSD_M1.csv')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const percents: number[] = []
    const map = buildImportTimeframesJob(parsed.candles, (progress) => {
      percents.push(progress.percent)
      expect(progress.job).toBe('build')
    })
    expect(map['1m']).toHaveLength(MIN_1M_CANDLES_FOR_IMPORT)
    expect(map['5m']?.length).toBeGreaterThan(0)
    expect(map['1d']?.length).toBeGreaterThan(0)
    expect(percents[percents.length - 1]).toBe(63)

    const dailyHours = map['1d'].map((c) => new Date(c.time * 1000).getUTCHours())
    expect(dailyHours.every((hour) => hour === 21 || hour === 22)).toBe(true)
    expect(dailyHours).not.toContain(0)
    expect(dailyHours[0]).toBe(22)
  })
})
