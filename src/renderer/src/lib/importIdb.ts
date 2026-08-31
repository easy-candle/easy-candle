import type { Candle } from '@shared/candleUtils'
import { IMPORT_STORED_TIMEFRAMES } from '@shared/candleAggregate'
import type { ImportedDatasetMeta } from '@shared/importTypes'

const DB_NAME = 'easycandle_db'
const DB_VERSION = 1

export function openImportDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('metas')) {
        db.createObjectStore('metas', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('candles')) {
        db.createObjectStore('candles', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('sources')) {
        db.createObjectStore('sources', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
  })
}

export async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const db = await openImportDb()
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.get(key)
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function idbPut(storeName: string, value: unknown): Promise<boolean> {
  try {
    const db = await openImportDb()
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.put(value)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openImportDb()
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.getAll()
      req.onsuccess = () => resolve((req.result as T[]) || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

export async function idbDelete(storeName: string, key: string): Promise<boolean> {
  try {
    const db = await openImportDb()
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      const req = store.delete(key)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

/** One transaction: meta + source CSV + every stored timeframe series. */
export async function idbWriteImportDataset(params: {
  meta: ImportedDatasetMeta
  content: string
  candlesByTimeframe: Record<string, Candle[]>
}): Promise<boolean> {
  try {
    const db = await openImportDb()
    return new Promise((resolve) => {
      const tx = db.transaction(['metas', 'sources', 'candles'], 'readwrite')
      tx.objectStore('metas').put(params.meta)
      tx.objectStore('sources').put({ id: params.meta.id, content: params.content })
      const candleStore = tx.objectStore('candles')
      for (const tf of IMPORT_STORED_TIMEFRAMES) {
        const series = params.candlesByTimeframe[tf]
        if (!series) continue
        candleStore.put({ key: `${params.meta.id}:${tf}`, candles: series })
      }
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    })
  } catch {
    return false
  }
}

export async function idbDeleteImportDataset(id: string): Promise<boolean> {
  try {
    const db = await openImportDb()
    return new Promise((resolve) => {
      const tx = db.transaction(['metas', 'sources', 'candles'], 'readwrite')
      tx.objectStore('metas').delete(id)
      tx.objectStore('sources').delete(id)
      const candleStore = tx.objectStore('candles')
      for (const tf of IMPORT_STORED_TIMEFRAMES) {
        candleStore.delete(`${id}:${tf}`)
      }
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    })
  } catch {
    return false
  }
}
