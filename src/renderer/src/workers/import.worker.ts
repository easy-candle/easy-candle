import { buildImportedDatasetMeta } from '@shared/importMeta'
import { IMPORT_BUILD_UI_PERCENT } from '@shared/importJobProgress'
import {
  buildImportTimeframesJob,
  clientParseResult,
  parseImportBytes
} from '@shared/importWorkerJob'
import type { Candle } from '@shared/candleUtils'
import type { ImportWorkerInbound, ImportWorkerOutbound } from '@shared/importWorkerProtocol'
import { idbGet, idbWriteImportDataset } from '../lib/importIdb'
import type { ImportedDatasetMeta } from '@shared/importTypes'

type ImportWorkerScope = {
  postMessage: (message: ImportWorkerOutbound) => void
  onmessage:
    | ((
        event: MessageEvent<
          ImportWorkerInbound | { type: 'discard'; requestId: number; token: string }
        >
      ) => void)
    | null
}

const workerSelf = self as unknown as ImportWorkerScope

type StoredParse = {
  token: string
  content: string
  candles: Candle[]
  fileName: string
}

let stored: StoredParse | null = null

function post(message: ImportWorkerOutbound): void {
  workerSelf.postMessage(message)
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'imp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

workerSelf.onmessage = (
  event: MessageEvent<ImportWorkerInbound | { type: 'discard'; requestId: number; token: string }>
) => {
  const message = event.data
  const requestId = message.requestId
  void handle(message, requestId)
}

async function handle(
  message: ImportWorkerInbound | { type: 'discard'; requestId: number; token: string },
  requestId: number
): Promise<void> {
  try {
    if (message.type === 'parse') {
      const { result, content } = parseImportBytes(message.bytes, message.fileName, (progress) => {
        post({ type: 'progress', requestId, progress })
      })
      if (!result.ok) {
        stored = null
        post({ type: 'parseResult', requestId, result })
        return
      }
      const token = generateId()
      stored = { token, content, candles: result.candles, fileName: message.fileName }
      post({
        type: 'parseResult',
        requestId,
        result: clientParseResult(result, token)
      })
      return
    }

    if (message.type === 'save') {
      if (!stored || stored.token !== message.token) {
        post({
          type: 'error',
          requestId,
          error: 'Import parse expired. Select the CSV again.'
        })
        return
      }

      const candlesByTimeframe = buildImportTimeframesJob(stored.candles, (progress) => {
        post({ type: 'progress', requestId, progress })
      })

      post({
        type: 'progress',
        requestId,
        progress: {
          job: 'save',
          phase: 'Saving…',
          percent: IMPORT_BUILD_UI_PERCENT.saving
        }
      })

      let id = message.replaceId
      let createdAt: string | undefined
      let updated = false

      if (id) {
        const existing = await idbGet<ImportedDatasetMeta>('metas', id)
        if (!existing) {
          post({
            type: 'saveResult',
            requestId,
            result: { ok: false, error: 'Saved import not found for update.' }
          })
          return
        }
        createdAt = existing.createdAt
        updated = true
      } else {
        id = generateId()
      }

      const meta = buildImportedDatasetMeta({
        id,
        originalFileName: message.originalFileName,
        symbol: message.symbol,
        candlesByTimeframe,
        createdAt,
        origin: message.origin
      })

      const wrote = await idbWriteImportDataset({
        meta,
        content: stored.content,
        candlesByTimeframe
      })
      stored = null
      if (!wrote) {
        post({
          type: 'saveResult',
          requestId,
          result: { ok: false, error: 'Failed to save import to IndexedDB.' }
        })
        return
      }
      post({ type: 'saveResult', requestId, result: { ok: true, meta, updated } })
      return
    }

    if (message.type === 'discard') {
      if (stored?.token === message.token) stored = null
      return
    }

    post({ type: 'error', requestId, error: `Unsupported worker job: ${message.type}` })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Import worker failed'
    post({ type: 'error', requestId, error })
  }
}
