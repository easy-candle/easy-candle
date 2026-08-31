import type { ImportJobProgress } from '@shared/importJobProgress'
import type { ImportParseResult, ImportSaveParams, ImportSaveResult } from '@shared/importTypes'
import type {
  ImportWorkerInbound,
  ImportWorkerJob,
  ImportWorkerOutbound
} from '@shared/importWorkerProtocol'

type ProgressHandler = (progress: ImportJobProgress) => void

let worker: Worker | null = null
let requestSeq = 1
const pending = new Map<
  number,
  {
    resolve: (value: ImportWorkerOutbound) => void
    reject: (error: Error) => void
  }
>()
const progressListeners = new Set<ProgressHandler>()

function emitProgress(progress: ImportJobProgress): void {
  progressListeners.forEach((listener) => {
    try {
      listener(progress)
    } catch (err) {
      console.error(err)
    }
  })
}

export function onWebImportProgress(listener: ProgressHandler): () => void {
  progressListeners.add(listener)
  return () => {
    progressListeners.delete(listener)
  }
}

function nextRequestId(): number {
  requestSeq += 1
  return requestSeq
}

async function getWorker(): Promise<Worker> {
  if (worker) return worker
  const mod = await import('../workers/import.worker?worker')
  const ImportWorker = mod.default
  worker = new ImportWorker()
  worker.onmessage = (event: MessageEvent<ImportWorkerOutbound>) => {
    const outbound = event.data
    if (outbound.type === 'progress') {
      emitProgress(outbound.progress)
      return
    }
    const waiter = pending.get(outbound.requestId)
    if (!waiter) return
    pending.delete(outbound.requestId)
    waiter.resolve(outbound)
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Import worker failed')
    pending.forEach((waiter) => waiter.reject(error))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

function postJob(
  instance: Worker,
  message: ImportWorkerJob,
  transfer: Transferable[] = []
): Promise<ImportWorkerOutbound> {
  const requestId = nextRequestId()
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    instance.postMessage({ ...message, requestId } as ImportWorkerInbound, transfer)
  })
}

export async function parseCsvInWebWorker(
  bytes: ArrayBuffer,
  fileName: string
): Promise<ImportParseResult> {
  const instance = await getWorker()
  const outbound = await postJob(instance, { type: 'parse', fileName, bytes }, [bytes])
  if (outbound.type === 'error') return { ok: false, error: outbound.error }
  if (outbound.type !== 'parseResult') {
    return { ok: false, error: 'Import worker returned an unexpected parse result.' }
  }
  return outbound.result
}

export async function saveImportInWebWorker(
  params: ImportSaveParams & { parseToken: string }
): Promise<ImportSaveResult> {
  const instance = await getWorker()
  const outbound = await postJob(instance, {
    type: 'save',
    token: params.parseToken,
    symbol: params.symbol,
    originalFileName: params.originalFileName,
    replaceId: params.replaceId,
    origin: params.origin
  })
  if (outbound.type === 'error') return { ok: false, error: outbound.error }
  if (outbound.type !== 'saveResult') {
    return { ok: false, error: 'Import worker returned an unexpected save result.' }
  }
  return outbound.result
}

export async function discardWebImportParse(token: string): Promise<void> {
  if (!worker) return
  const requestId = nextRequestId()
  worker.postMessage({ type: 'discard', requestId, token })
}
