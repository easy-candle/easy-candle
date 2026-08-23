import { dedupeCandlesByTime, type Candle } from './candleUtils'
import {
  IMPORT_SOURCE_TIMEFRAME,
  MIN_1M_CANDLES_FOR_IMPORT,
  minImportCandlesMessage
} from './importConstants'
import type { ImportParseResult } from './datasetTypes'
import { TIMEFRAMES, type TimeframeConfig } from './timeframes'

/** MetaTrader period codes → app timeframe ids. */
const MT_PERIOD_TO_TIMEFRAME: Record<string, string> = {
  M1: '1m',
  M5: '5m',
  M15: '15m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
  '1M': '1m',
  '5M': '5m',
  '15M': '15m',
  '1H': '1h',
  '4H': '4h',
  '1D': '1d',
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d'
}

/** Compact trailing digits in filenames like EURUSD15 → 15m. */
const COMPACT_MINUTES_TO_TIMEFRAME: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
  '1440': '1d'
}

const UNSUPPORTED_PERIODS = new Set(['M30', 'H12', 'W1', 'MN1', '30', '10080', '43200'])

const QUOTE_SUFFIX =
  /(?:USDT|USDC|USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|BTC|ETH|XAU|XAG)$/

function looksLikeMarketSymbol(symbol: string): boolean {
  if (!/^[A-Z][A-Z0-9]{2,14}$/.test(symbol)) return false
  if (QUOTE_SUFFIX.test(symbol)) return true
  // Classic 6-letter forex pairs (EURUSD, GBPJPY, …).
  return /^[A-Z]{6}$/.test(symbol)
}

export type FilenameMeta = {
  symbol: string | null
  timeframe: string | null
  unsupportedPeriod: string | null
}

/**
 * Extract symbol + timeframe hints from common MT4/MT5 export names:
 * - EURUSD_M15_20200101_20241231.csv  (underscored)
 * - XAUUSDM5.csv / EURUSDH1.csv        (glued period letter)
 * - GBPUSD_H1.csv
 * - BTCUSD15.csv                       (compact minutes)
 * - XAUUSD_PERIOD_M15.csv
 */
export function parseMtFilename(fileName: string): FilenameMeta {
  const base = String(fileName || '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.(csv|txt)$/i, '')
    .trim()

  if (!base) {
    return { symbol: null, timeframe: null, unsupportedPeriod: null }
  }

  const upper = base.toUpperCase()

  for (const period of UNSUPPORTED_PERIODS) {
    if (
      upper.includes(`_${period}_`) ||
      upper.endsWith(`_${period}`) ||
      upper.includes(`PERIOD_${period}`) ||
      new RegExp(`^[A-Z]+${period}(?:_|$)`).test(upper) ||
      new RegExp(`^[A-Z]+${period}$`).test(upper)
    ) {
      return { symbol: null, timeframe: null, unsupportedPeriod: period }
    }
  }

  // SYMBOL_PERIOD_... or SYMBOL_M15_...
  const underscored = upper.match(
    /^([A-Z][A-Z0-9]{1,14})_(?:PERIOD_)?(M1|M5|M15|H1|H4|D1|1M|5M|15M|1H|4H|1D)(?:_|$)/
  )
  if (underscored && looksLikeMarketSymbol(underscored[1])) {
    const timeframe = MT_PERIOD_TO_TIMEFRAME[underscored[2]] ?? null
    return { symbol: underscored[1], timeframe, unsupportedPeriod: null }
  }

  // Glued MetaTrader period: XAUUSDM5 / EURUSDH1 / GBPUSDM15[_range]
  // Longer periods first so M15 wins over M1/M5.
  const glued = upper.match(/^([A-Z][A-Z0-9]{1,14})(M15|M5|M1|H4|H1|D1)(?:_|$)/)
  if (glued && looksLikeMarketSymbol(glued[1])) {
    const timeframe = MT_PERIOD_TO_TIMEFRAME[glued[2]] ?? null
    return { symbol: glued[1], timeframe, unsupportedPeriod: null }
  }

  // Compact minutes: EURUSD15 / BTCUSD60
  const compact = upper.match(/^([A-Z][A-Z0-9]{1,14})(1|5|15|60|240|1440)(?:_|$)/)
  if (compact && looksLikeMarketSymbol(compact[1])) {
    const timeframe = COMPACT_MINUTES_TO_TIMEFRAME[compact[2]] ?? null
    return { symbol: compact[1], timeframe, unsupportedPeriod: null }
  }

  // Symbol-only prefix before first underscore (timeframe inferred from content later).
  const symbolOnly = upper.match(/^([A-Z][A-Z0-9]{2,14})(?:_|$)/)
  if (symbolOnly && looksLikeMarketSymbol(symbolOnly[1])) {
    return { symbol: symbolOnly[1], timeframe: null, unsupportedPeriod: null }
  }

  return { symbol: null, timeframe: null, unsupportedPeriod: null }
}

type FieldDelimiter = ',' | ';' | '\t' | 'whitespace'

function splitCsvLine(line: string, delimiter: FieldDelimiter): string[] {
  const parts =
    delimiter === 'whitespace'
      ? line.trim().split(/\s+/)
      : line.split(delimiter)
  return parts.map((part) => part.trim().replace(/^<|>$/g, '')).filter((part) => part.length > 0)
}

function scoreDelimiter(lines: string[], delimiter: FieldDelimiter): number {
  let score = 0
  const limit = Math.min(lines.length, 40)
  for (let i = 0; i < limit; i += 1) {
    const cells = splitCsvLine(lines[i], delimiter)
    if (looksLikeHeader(cells)) continue
    if (mapRowToCandle(cells)) score += 1
  }
  return score
}

function detectDelimiter(lines: string[]): FieldDelimiter {
  const candidates: FieldDelimiter[] = ['\t', ';', ',', 'whitespace']
  let best: FieldDelimiter = ','
  let bestScore = -1

  for (const candidate of candidates) {
    const score = scoreDelimiter(lines, candidate)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }

  // Prefer an explicit delimiter over whitespace when scores tie.
  if (bestScore <= 0) {
    const sample = lines[0] || ''
    const commas = (sample.match(/,/g) || []).length
    const semis = (sample.match(/;/g) || []).length
    const tabs = (sample.match(/\t/g) || []).length
    if (tabs >= commas && tabs >= semis && tabs > 0) return '\t'
    if (semis > commas) return ';'
    if (commas > 0) return ','
    return 'whitespace'
  }

  return best
}

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase()
  return (
    joined.includes('date') ||
    joined.includes('time') ||
    joined.includes('open') ||
    joined.includes('<date>')
  )
}

function parseMtDateTime(datePart: string, timePart?: string): number | null {
  const date = String(datePart || '').trim()
  const time = String(timePart || '').trim()

  // Combined: 2020.01.01 00:00[:00] or 2020-01-01 00:00
  const combined = date.match(
    /^(\d{4})[.\-/](\d{2})[.\-/](\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  )
  if (combined && !time) {
    const year = Number(combined[1])
    const month = Number(combined[2])
    const day = Number(combined[3])
    const hour = Number(combined[4] ?? 0)
    const minute = Number(combined[5] ?? 0)
    const second = Number(combined[6] ?? 0)
    return utcSeconds(year, month, day, hour, minute, second)
  }

  const d = date.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})$/)
  if (!d) return null

  const t = (time || '00:00').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!t) return null

  return utcSeconds(
    Number(d[1]),
    Number(d[2]),
    Number(d[3]),
    Number(t[1]),
    Number(t[2]),
    Number(t[3] ?? 0)
  )
}

function utcSeconds(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): number | null {
  if (
    ![year, month, day, hour, minute, second].every((n) => Number.isFinite(n)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }
  const ms = Date.UTC(year, month - 1, day, hour, minute, second)
  if (!Number.isFinite(ms)) return null
  return Math.floor(ms / 1000)
}

function parseNumber(value: string): number | null {
  let s = String(value || '')
    .trim()
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '')
  if (!s) return null

  // European decimals: 2914,37 or 1.234,56
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s) || /^\d+,\d+$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  }

  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function isValidOhlc(open: number, high: number, low: number, close: number): boolean {
  if (high < low) return false
  if (high < open && high < close) return false
  if (low > open && low > close) return false
  return true
}

function mapRowToCandle(cells: string[]): Candle | null {
  if (cells.length < 5) return null

  // MT5 often: DATE TIME OPEN HIGH LOW CLOSE ...
  // MT4 often: DATE,TIME,OPEN,HIGH,LOW,CLOSE,VOLUME
  let time: number | null = null
  let openIdx = 1

  const firstHasTime = /\d{1,2}:\d{2}/.test(cells[0])
  if (firstHasTime) {
    time = parseMtDateTime(cells[0])
    openIdx = 1
  } else if (cells.length >= 6 && /^\d{1,2}:\d{2}/.test(cells[1])) {
    time = parseMtDateTime(cells[0], cells[1])
    openIdx = 2
  } else {
    time = parseMtDateTime(cells[0])
    openIdx = 1
  }

  if (time == null) return null
  if (cells.length < openIdx + 4) return null

  const open = parseNumber(cells[openIdx])
  const high = parseNumber(cells[openIdx + 1])
  const low = parseNumber(cells[openIdx + 2])
  const close = parseNumber(cells[openIdx + 3])
  if (open == null || high == null || low == null || close == null) return null
  if (!isValidOhlc(open, high, low, close)) return null

  const candle: Candle = { time, open, high, low, close }
  const volume = parseNumber(cells[openIdx + 4] ?? '')
  if (volume != null) candle.volume = volume
  return candle
}

/**
 * Infer the dominant bar step (seconds) from consecutive candle open times.
 */
export function inferTimeframeSeconds(candles: Candle[]): number | null {
  if (candles.length < 3) return null

  const counts = new Map<number, number>()
  const limit = Math.min(candles.length - 1, 500)
  for (let i = 0; i < limit; i += 1) {
    const delta = candles[i + 1].time - candles[i].time
    if (delta <= 0) continue
    counts.set(delta, (counts.get(delta) || 0) + 1)
  }

  let bestDelta: number | null = null
  let bestCount = 0
  for (const [delta, count] of counts) {
    if (count > bestCount) {
      bestDelta = delta
      bestCount = count
    }
  }

  return bestDelta
}

export function matchTimeframeBySeconds(seconds: number): TimeframeConfig | null {
  for (const tf of Object.values(TIMEFRAMES)) {
    if (tf.seconds === seconds) return tf
  }
  return null
}

export function parseMtCsv(content: string, fileName: string): ImportParseResult {
  const warnings: string[] = []
  const fileMeta = parseMtFilename(fileName)

  if (fileMeta.unsupportedPeriod) {
    return {
      ok: false,
      error: `Timeframe ${fileMeta.unsupportedPeriod} from the file name is not supported. Import only 1-minute (M1) exports.`
    }
  }

  if (fileMeta.timeframe && fileMeta.timeframe !== IMPORT_SOURCE_TIMEFRAME) {
    return {
      ok: false,
      error: `File name suggests timeframe ${fileMeta.timeframe}. Import only 1-minute (M1) MetaTrader exports.`
    }
  }

  const text = String(content || '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/\u00a0/g, ' ')

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return { ok: false, error: 'CSV file is empty.' }
  }

  const delimiter = detectDelimiter(lines)
  let startIndex = 0
  const firstCells = splitCsvLine(lines[0], delimiter)
  if (looksLikeHeader(firstCells)) {
    startIndex = 1
  }

  if (startIndex >= lines.length) {
    return { ok: false, error: 'CSV has a header but no candle rows.' }
  }

  const raw: Candle[] = []
  let skipped = 0
  for (let i = startIndex; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i], delimiter)
    const candle = mapRowToCandle(cells)
    if (candle) raw.push(candle)
    else skipped += 1
  }

  if (!raw.length) {
    return {
      ok: false,
      error: 'No valid MT4/MT5 candle rows found. Expected Date/Time, Open, High, Low, Close.'
    }
  }

  const candles = dedupeCandlesByTime(raw)
  if (candles.length < 2) {
    return { ok: false, error: 'Need at least 2 valid candles to verify the timeframe.' }
  }

  if (skipped > 0) {
    warnings.push(`Skipped ${skipped} invalid or incomplete row(s).`)
  }

  const inferredSeconds = inferTimeframeSeconds(candles)
  if (inferredSeconds == null) {
    return { ok: false, error: 'Could not infer timeframe from candle spacing.' }
  }

  const inferredTf = matchTimeframeBySeconds(inferredSeconds)
  if (!inferredTf) {
    return {
      ok: false,
      error: `Candle spacing is ${inferredSeconds}s, which is not 1-minute. Export M1 data from MetaTrader.`
    }
  }

  if (inferredTf.id !== IMPORT_SOURCE_TIMEFRAME) {
    return {
      ok: false,
      error: `Candle spacing matches ${inferredTf.id}. Import only 1-minute (M1) data — higher timeframes are built automatically.`
    }
  }

  if (candles.length < MIN_1M_CANDLES_FOR_IMPORT) {
    return { ok: false, error: minImportCandlesMessage(candles.length) }
  }

  if (!fileMeta.symbol) {
    warnings.push('Symbol not found in file name — enter it before confirming.')
  }

  const spanDays = (candles[candles.length - 1].time - candles[0].time) / 86400
  warnings.push(
    `Will build 5m, 15m, 1h, 4h, and 1d from this 1m series (~${spanDays.toFixed(1)} days, ${candles.length.toLocaleString()} bars).`
  )

  return {
    ok: true,
    candles,
    symbol: fileMeta.symbol,
    timeframe: IMPORT_SOURCE_TIMEFRAME,
    inferredTimeframe: IMPORT_SOURCE_TIMEFRAME,
    symbolFromFilename: Boolean(fileMeta.symbol),
    timeframeFromFilename: Boolean(fileMeta.timeframe),
    warnings
  }
}
