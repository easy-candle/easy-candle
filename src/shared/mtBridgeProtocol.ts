import { dedupeCandlesByTime, type Candle } from './candleUtils'
import { TIMEFRAMES } from './timeframes'

/** Protocol version accepted by the Easy Candle listener. */
export const MT_BRIDGE_PROTOCOL_VERSION = 1

/** Loopback-only WebSocket port. The EA connects as a client. */
export const MT_BRIDGE_DEFAULT_PORT = 17321

export const MT_BRIDGE_HOST = '127.0.0.1'

export const MT_BRIDGE_WS_URL = `ws://${MT_BRIDGE_HOST}:${MT_BRIDGE_DEFAULT_PORT}`

/** Stable on-disk import id for a MetaTrader symbol. */
export function mtDatasetId(symbol: string): string {
  const cleaned = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._]/g, '_')
  return `mt-${cleaned}`
}

export function isMtDatasetId(id: string): boolean {
  return String(id || '').startsWith('mt-')
}

const HISTORY_BAR_LIMIT = 20_000

const TIMEFRAME_ALIASES: Record<string, string> = {
  M1: '1m',
  '1M': '1m',
  '1m': '1m',
  M5: '5m',
  '5M': '5m',
  '5m': '5m',
  M15: '15m',
  '15M': '15m',
  '15m': '15m',
  H1: '1h',
  '1H': '1h',
  '1h': '1h',
  H4: '4h',
  '4H': '4h',
  '4h': '4h',
  D1: '1d',
  '1D': '1d',
  '1d': '1d'
}

export type MtHelloMessage = {
  v: typeof MT_BRIDGE_PROTOCOL_VERSION
  type: 'hello'
  symbol: string
  tf: string
  token?: string
}

export type MtHistoryMessage = {
  v: typeof MT_BRIDGE_PROTOCOL_VERSION
  type: 'history'
  symbol: string
  tf: string
  candles: Candle[]
}

export type MtBarMessage = {
  v: typeof MT_BRIDGE_PROTOCOL_VERSION
  type: 'bar'
  symbol: string
  tf: string
  candle: Candle
}

export type MtPingMessage = {
  v: typeof MT_BRIDGE_PROTOCOL_VERSION
  type: 'ping'
}

export type MtBridgeMessage = MtHelloMessage | MtHistoryMessage | MtBarMessage | MtPingMessage

export type MtParseSuccess = { ok: true; message: MtBridgeMessage }
export type MtParseFailure = { ok: false; error: string }
export type MtParseResult = MtParseSuccess | MtParseFailure

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseVersion(value: unknown): boolean {
  return Number(value) === MT_BRIDGE_PROTOCOL_VERSION
}

export function mapMtTimeframe(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const mapped = TIMEFRAME_ALIASES[trimmed] ?? TIMEFRAME_ALIASES[trimmed.toUpperCase()]
  if (!mapped || !TIMEFRAMES[mapped]) return null
  return mapped
}

export function parseMtSymbol(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const symbol = raw.trim().toUpperCase()
  if (!/^[A-Z0-9._]{1,32}$/.test(symbol)) return null
  return symbol
}

function parseTimeSeconds(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  const seconds = n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
  return seconds > 0 ? seconds : null
}

export function parseMtBar(raw: unknown): Candle | null {
  const row = asRecord(raw)
  if (!row) return null

  const time = parseTimeSeconds(row.t ?? row.time)
  const open = Number(row.o ?? row.open)
  const high = Number(row.h ?? row.high)
  const low = Number(row.l ?? row.low)
  const close = Number(row.c ?? row.close)
  const volume = row.vol ?? row.volume

  if (
    time == null ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return null
  }

  const candle: Candle = { time, open, high, low, close }
  const vol = Number(volume)
  if (Number.isFinite(vol)) candle.volume = vol
  return candle
}

/** Update the forming bar, or append when the open time advances. Ignore older bars. */
export function applyLiveBar(candles: Candle[], bar: Candle): Candle[] {
  if (!bar) return Array.isArray(candles) ? candles : []
  if (!Array.isArray(candles) || candles.length === 0) return [bar]

  const last = candles[candles.length - 1]
  if (bar.time === last.time) return [...candles.slice(0, -1), bar]
  if (bar.time > last.time) return [...candles, bar]
  return candles
}

function parseHello(row: Record<string, unknown>): MtParseResult {
  const symbol = parseMtSymbol(row.symbol)
  const tf = mapMtTimeframe(row.tf)
  if (!symbol) return { ok: false, error: 'hello.symbol is invalid' }
  if (!tf) return { ok: false, error: 'hello.tf is invalid' }

  const message: MtHelloMessage = { v: 1, type: 'hello', symbol, tf }
  if (typeof row.token === 'string' && row.token) message.token = row.token
  return { ok: true, message }
}

function parseHistory(row: Record<string, unknown>): MtParseResult {
  const symbol = parseMtSymbol(row.symbol)
  const tf = mapMtTimeframe(row.tf)
  if (!symbol) return { ok: false, error: 'history.symbol is invalid' }
  if (!tf) return { ok: false, error: 'history.tf is invalid' }

  const rawBars = row.bars ?? row.candles
  if (!Array.isArray(rawBars)) return { ok: false, error: 'history.bars must be an array' }

  const parsed: Candle[] = []
  for (const item of rawBars) {
    const candle = parseMtBar(item)
    if (candle) parsed.push(candle)
  }

  const candles = dedupeCandlesByTime(parsed).slice(-HISTORY_BAR_LIMIT)
  return {
    ok: true,
    message: { v: 1, type: 'history', symbol, tf, candles }
  }
}

function parseBarMessage(row: Record<string, unknown>): MtParseResult {
  const symbol = parseMtSymbol(row.symbol)
  const tf = mapMtTimeframe(row.tf)
  if (!symbol) return { ok: false, error: 'bar.symbol is invalid' }
  if (!tf) return { ok: false, error: 'bar.tf is invalid' }

  const candle = parseMtBar(row)
  if (!candle) return { ok: false, error: 'bar is missing a valid OHLC payload' }

  return {
    ok: true,
    message: { v: 1, type: 'bar', symbol, tf, candle }
  }
}

export function parseMtBridgeMessage(raw: unknown): MtParseResult {
  let value: unknown = raw

  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return { ok: false, error: 'Empty message' }
    try {
      value = JSON.parse(text)
    } catch {
      return { ok: false, error: 'Message is not valid JSON' }
    }
  }

  const row = asRecord(value)
  if (!row) return { ok: false, error: 'Message must be a JSON object' }
  if (!parseVersion(row.v)) {
    return { ok: false, error: `Unsupported protocol version (expected ${MT_BRIDGE_PROTOCOL_VERSION})` }
  }

  const type = row.type
  if (type === 'ping') return { ok: true, message: { v: 1, type: 'ping' } }
  if (type === 'hello') return parseHello(row)
  if (type === 'history') return parseHistory(row)
  if (type === 'bar') return parseBarMessage(row)

  return { ok: false, error: 'Unknown message type' }
}
