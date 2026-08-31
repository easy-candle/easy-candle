import type { Candle } from './candleUtils'
import { buildImportTimeframesWithProgress, type ImportBuildProgress } from './candleAggregate'
import type { ImportJobProgress } from './importJobProgress'
import type { CsvParseProgress } from './mtCsvImport'
import { parseMtCsvWithProgress } from './mtCsvImport'
import { decodeMtTextBytes } from './mtTextDecode'
import type { ImportParseResult } from './importTypes'

export function parseImportBytes(
  bytes: ArrayBuffer,
  fileName: string,
  onProgress?: (progress: ImportJobProgress) => void
): { result: ImportParseResult; content: string } {
  const content = decodeMtTextBytes(new Uint8Array(bytes))
  const result = parseMtCsvWithProgress(content, fileName, (parseProgress) => {
    onProgress?.(mapParseProgress(parseProgress))
  })
  return { result, content }
}

export function buildImportTimeframesJob(
  candles1m: Candle[],
  onProgress?: (progress: ImportJobProgress) => void
): Record<string, Candle[]> {
  return buildImportTimeframesWithProgress(candles1m, (buildProgress) => {
    onProgress?.(mapBuildProgress(buildProgress))
  })
}

function mapParseProgress(progress: CsvParseProgress): ImportJobProgress {
  return {
    job: 'parse',
    phase: progress.phase,
    percent: progress.percent,
    processedRows: progress.processedRows,
    totalRows: progress.totalRows
  }
}

function mapBuildProgress(progress: ImportBuildProgress): ImportJobProgress {
  return {
    job: 'build',
    phase: progress.phase,
    percent: progress.percent
  }
}

export function clientParseResult(
  result: ImportParseResult,
  parseToken?: string
): ImportParseResult {
  if (!result.ok) return result
  return {
    ...result,
    candles: [],
    parseToken,
    candleCount: result.candleCount,
    firstTime: result.firstTime,
    lastTime: result.lastTime
  }
}
