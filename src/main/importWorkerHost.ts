import { Worker } from 'node:worker_threads'
import workerPath from './importWorker?modulePath'
import type { Candle } from '../shared/candleUtils'
import type { ImportJobProgress } from '../shared/importJobProgress'
import type { ImportParseResult } from '../shared/importTypes'
import type {
  ImportWorkerInbound,
  ImportWorkerJob,
  ImportWorkerOutbound
} from '../shared/importWorkerProtocol'

let requestSeq = 1

function nextRequestId(): number {
  requestSeq += 1
  return requestSeq
}

function runImportWorker(
  message: ImportWorkerJob,
  transfer: ArrayBuffer[],
  onProgress?: (progress: ImportJobProgress) => void
): Promise<ImportWorkerOutbound> {
  return new Promise((resolve, reject) => {
    const requestId = nextRequestId()
    const worker = new Worker(workerPath)
    let settled = false

    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      fn()
      void worker.terminate()
    }

    worker.on('message', (outbound: ImportWorkerOutbound) => {
      if (outbound.requestId !== requestId) return
      if (outbound.type === 'progress') {
        onProgress?.(outbound.progress)
        return
      }
      finish(() => resolve(outbound))
    })

    worker.on('error', (err) => {
      finish(() => reject(err))
    })

    worker.on('exit', (code) => {
      if (settled) return
      finish(() => reject(new Error(`Import worker exited with code ${code}`)))
    })

    const inbound = { ...message, requestId } as ImportWorkerInbound
    worker.postMessage(inbound, transfer)
  })
}

export async function parseCsvInWorker(
  bytes: ArrayBuffer,
  fileName: string,
  onProgress?: (progress: ImportJobProgress) => void
): Promise<{ result: ImportParseResult; content: string }> {
  const outbound = await runImportWorker({ type: 'parse', fileName, bytes }, [bytes], onProgress)
  if (outbound.type === 'error') {
    return { result: { ok: false, error: outbound.error }, content: '' }
  }
  if (outbound.type !== 'parseResult') {
    return {
      result: { ok: false, error: 'Import worker returned an unexpected parse result.' },
      content: ''
    }
  }
  return { result: outbound.result, content: outbound.content ?? '' }
}

export async function buildTimeframesInWorker(
  candles: Candle[],
  onProgress?: (progress: ImportJobProgress) => void
): Promise<Record<string, Candle[]>> {
  const outbound = await runImportWorker({ type: 'build', candles }, [], onProgress)
  if (outbound.type === 'error') {
    throw new Error(outbound.error)
  }
  if (outbound.type !== 'buildResult') {
    throw new Error('Import worker returned an unexpected build result.')
  }
  return outbound.candlesByTimeframe
}
