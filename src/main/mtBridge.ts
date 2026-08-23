import { BrowserWindow, ipcMain } from 'electron'
import WebSocket, { type RawData, WebSocketServer } from 'ws'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import {
  MT_BRIDGE_DEFAULT_PORT,
  MT_BRIDGE_HOST,
  mtDatasetId,
  parseMtBridgeMessage
} from '@shared/mtBridgeProtocol'
import { flushAllMtDatasets, upsertMtCandles, applyIncomingMtPreview, getMtPreviewCandles, getMtPreviewSummary } from './datasets'
import type { MtBridgeIpcEvent, MtBridgeStatusResult, MtPreviewLoadResult } from '@shared/mtBridgeTypes'

let server: WebSocketServer | null = null
let client: WebSocket | null = null
let lastError: string | undefined
let lastSymbol: string | undefined
let lastTimeframe: string | undefined
let lastDatasetId: string | undefined
let persistChain: Promise<void> = Promise.resolve()

function rawToText(data: RawData): string {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.from(data).toString('utf8')
}

function isLoopback(address: string | undefined): boolean {
  if (!address) return false
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    address === 'localhost'
  )
}

function broadcast(payload: MtBridgeIpcEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.MT_BRIDGE_EVENT, payload)
    }
  }
}

function isClientOpen(): boolean {
  return Boolean(client && client.readyState === WebSocket.OPEN)
}

function getStatus(error?: string): MtBridgeStatusResult {
  const nextError = error ?? lastError
  const preview = getMtPreviewSummary()
  return {
    ok: Boolean(server),
    listening: Boolean(server),
    port: MT_BRIDGE_DEFAULT_PORT,
    connected: isClientOpen(),
    ...(nextError ? { error: nextError } : {}),
    ...(lastSymbol ? { symbol: lastSymbol } : {}),
    ...(lastTimeframe ? { timeframe: lastTimeframe } : {}),
    ...(lastDatasetId ? { datasetId: lastDatasetId } : {}),
    ...(preview ? { preview } : {})
  }
}

function emitStatus(error?: string): void {
  if (error) lastError = error
  else lastError = undefined
  const status = getStatus()
  broadcast({
    type: 'status',
    listening: status.listening,
    port: status.port,
    connected: status.connected,
    ...(status.error ? { error: status.error } : {}),
    ...(status.symbol ? { symbol: status.symbol } : {}),
    ...(status.timeframe ? { timeframe: status.timeframe } : {}),
    ...(status.datasetId ? { datasetId: status.datasetId } : {}),
    ...(status.preview ? { preview: status.preview } : {})
  })
}

function resetFeedCache(): void {
  lastSymbol = undefined
  lastTimeframe = undefined
  lastDatasetId = undefined
}

function rememberIdentity(symbol: string, timeframe: string): void {
  lastSymbol = symbol
  lastTimeframe = timeframe
  lastDatasetId = mtDatasetId(symbol)
}

function enqueuePersist(task: () => Promise<void>): void {
  persistChain = persistChain.then(task).catch((err) => {
    const message = err instanceof Error ? err.message : 'MetaTrader persist failed'
    broadcast({ type: 'error', message })
  })
}

function handlePayload(raw: unknown): void {
  const parsed = parseMtBridgeMessage(raw)
  if (!parsed.ok) {
    broadcast({ type: 'error', message: parsed.error })
    return
  }

  const message = parsed.message
  if (message.type === 'ping') return

  if (message.type === 'hello') {
    rememberIdentity(message.symbol, message.tf)
    broadcast({
      type: 'hello',
      symbol: message.symbol,
      timeframe: message.tf,
      datasetId: mtDatasetId(message.symbol)
    })
    emitStatus()
    return
  }

  if (message.tf !== '1m') {
    broadcast({
      type: 'error',
      message: 'MetaTrader disk import requires M1 bars. Send tf M1 / 1m.'
    })
    return
  }

  if (message.type === 'history') {
    rememberIdentity(message.symbol, message.tf)
    const preview = applyIncomingMtPreview(message.symbol, message.candles)
    if (preview) broadcast({ type: 'preview', preview })
    enqueuePersist(async () => {
      const result = await upsertMtCandles({
        symbol: message.symbol,
        incoming: message.candles,
        flush: true
      })
      if (!result.ok) {
        broadcast({ type: 'error', message: result.error })
        return
      }
      if (!result.persisted) {
        emitStatus()
        return
      }
      lastDatasetId = result.meta.id
      broadcast({ type: 'dataset', meta: result.meta, candles1m: result.candles1m })
      emitStatus()
    })
    return
  }

  rememberIdentity(message.symbol, message.tf)
  const preview = applyIncomingMtPreview(message.symbol, [message.candle])
  if (preview) broadcast({ type: 'preview', preview })
  // Live bars stay in preview only. The chart loads a confirmed 1m import and
  // aggregates other timeframes from that snapshot — no online candle updates.
}

function attachClient(ws: WebSocket): void {
  if (client && client !== ws) {
    client.removeAllListeners()
    try {
      client.close()
    } catch {
      // ignore
    }
  }

  client = ws
  resetFeedCache()
  emitStatus()

  ws.on('message', (data) => {
    handlePayload(rawToText(data))
  })

  ws.on('close', () => {
    if (client === ws) {
      client = null
      broadcast({ type: 'disconnected' })
      emitStatus()
    }
  })

  ws.on('error', () => {
    if (client === ws) {
      client = null
      emitStatus('MetaTrader socket error')
    }
  })
}

export async function startMtBridge(): Promise<MtBridgeStatusResult> {
  await flushAllMtDatasets()
  if (server) return getStatus()

  return new Promise((resolve) => {
    const wss = new WebSocketServer({ host: MT_BRIDGE_HOST, port: MT_BRIDGE_DEFAULT_PORT })
    let settled = false

    const finish = (error?: string): void => {
      if (settled) return
      settled = true
      resolve(getStatus(error))
    }

    wss.on('listening', () => {
      server = wss
      lastError = undefined
      emitStatus()
      finish()
    })

    wss.on('error', (err) => {
      const message = err instanceof Error ? err.message : 'Failed to start MetaTrader listener'
      if (!server) {
        lastError = message
        finish(message)
        return
      }
      lastError = message
      emitStatus(message)
    })

    wss.on('connection', (ws, req) => {
      if (!isLoopback(req.socket.remoteAddress)) {
        ws.close()
        return
      }
      attachClient(ws)
    })
  })
}

export function stopMtBridge(): MtBridgeStatusResult {
  void flushAllMtDatasets()
  if (client) {
    try {
      client.close()
    } catch {
      // ignore
    }
    client = null
  }

  if (server) {
    const current = server
    server = null
    current.close()
  }

  resetFeedCache()
  lastError = undefined
  emitStatus()
  return getStatus()
}

export function getMtBridgeStatus(): MtBridgeStatusResult {
  return getStatus()
}

export function getMtPreview(): MtPreviewLoadResult {
  const preview = getMtPreviewCandles()
  if (!preview?.candles.length) {
    return { ok: false, error: 'No MetaTrader candles received yet. Attach the EA and wait for M1 history.' }
  }
  return { ok: true, symbol: preview.symbol, candles: preview.candles }
}

export function registerMtBridgeIpc(): void {
  ipcMain.handle(IPC_CHANNELS.MT_BRIDGE_START, () => startMtBridge())
  ipcMain.handle(IPC_CHANNELS.MT_BRIDGE_STOP, () => stopMtBridge())
  ipcMain.handle(IPC_CHANNELS.MT_BRIDGE_STATUS, () => getMtBridgeStatus())
  ipcMain.handle(IPC_CHANNELS.MT_BRIDGE_PREVIEW, (): MtPreviewLoadResult => getMtPreview())
  void startMtBridge()
}
