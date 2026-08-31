import { parentPort } from 'node:worker_threads'
import { buildImportTimeframesJob, parseImportBytes } from '../shared/importWorkerJob'
import type { ImportWorkerInbound, ImportWorkerOutbound } from '../shared/importWorkerProtocol'

if (!parentPort) {
  throw new Error('importWorker must run as a worker_thread')
}

const port = parentPort

function post(message: ImportWorkerOutbound): void {
  port.postMessage(message)
}

port.on('message', (message: ImportWorkerInbound) => {
  const requestId = message.requestId
  try {
    if (message.type === 'parse') {
      const { result, content } = parseImportBytes(message.bytes, message.fileName, (progress) => {
        post({ type: 'progress', requestId, progress })
      })
      post({ type: 'parseResult', requestId, result, content })
      return
    }

    if (message.type === 'build') {
      const candlesByTimeframe = buildImportTimeframesJob(message.candles, (progress) => {
        post({ type: 'progress', requestId, progress })
      })
      post({ type: 'buildResult', requestId, candlesByTimeframe })
      return
    }

    post({ type: 'error', requestId, error: `Unsupported worker job: ${message.type}` })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Import worker failed'
    post({ type: 'error', requestId, error })
  }
})
