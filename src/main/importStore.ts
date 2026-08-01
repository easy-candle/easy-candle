import { randomUUID } from 'crypto'
import { app, dialog, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import { basename, join } from 'path'
import type { Candle } from '@shared/candleUtils'
import type {
  ImportDeleteResult,
  ImportDialogResult,
  ImportListResult,
  ImportLoadResult,
  ImportReadResult,
  ImportSaveParams,
  ImportSaveResult,
  ImportedDatasetMeta
} from '@shared/importTypes'
import { decodeMtTextBuffer } from '@shared/mtTextDecode'

function importsRoot(): string {
  return join(app.getPath('userData'), 'imports')
}

function metaPath(id: string): string {
  return join(importsRoot(), id, 'meta.json')
}

function dataPath(id: string): string {
  return join(importsRoot(), id, 'data.csv')
}

async function ensureImportsRoot(): Promise<void> {
  await fs.mkdir(importsRoot(), { recursive: true })
}

async function readMeta(id: string): Promise<ImportedDatasetMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(id), 'utf8')
    const parsed = JSON.parse(raw) as ImportedDatasetMeta
    if (!parsed || typeof parsed.id !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

async function writeMeta(meta: ImportedDatasetMeta): Promise<void> {
  await fs.mkdir(join(importsRoot(), meta.id), { recursive: true })
  await fs.writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2), 'utf8')
}

function buildMeta(params: {
  id: string
  originalFileName: string
  symbol: string
  timeframe: string
  candles: Candle[]
  createdAt?: string
}): ImportedDatasetMeta {
  const now = new Date().toISOString()
  const first = params.candles[0]
  const last = params.candles[params.candles.length - 1]
  return {
    id: params.id,
    symbol: params.symbol,
    timeframe: params.timeframe,
    originalFileName: params.originalFileName,
    candleCount: params.candles.length,
    firstTime: first?.time ?? 0,
    lastTime: last?.time ?? 0,
    createdAt: params.createdAt ?? now,
    updatedAt: now
  }
}

async function openCsvDialog(): Promise<ImportDialogResult> {
  const result = await dialog.showOpenDialog({
    title: 'Import MT4/MT5 candles',
    properties: ['openFile'],
    filters: [
      { name: 'CSV / TXT', extensions: ['csv', 'txt'] },
      { name: 'All files', extensions: ['*'] }
    ]
  })

  if (result.canceled || !result.filePaths.length) {
    return { ok: false, canceled: true }
  }

  const path = result.filePaths[0]
  return { ok: true, path, fileName: basename(path) }
}

async function readCsvFile(filePath: string): Promise<ImportReadResult> {
  try {
    const buffer = await fs.readFile(filePath)
    const content = decodeMtTextBuffer(buffer)
    return { ok: true, content, fileName: basename(filePath) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read file'
    return { ok: false, error: message }
  }
}

async function saveImport(params: ImportSaveParams): Promise<ImportSaveResult> {
  try {
    await ensureImportsRoot()

    let id = params.replaceId
    let createdAt: string | undefined

    if (id) {
      const existing = await readMeta(id)
      if (!existing) {
        return { ok: false, error: 'Saved import not found for update.' }
      }
      createdAt = existing.createdAt
    } else {
      id = randomUUID()
    }

    const meta = buildMeta({
      id,
      originalFileName: params.originalFileName,
      symbol: params.symbol,
      timeframe: params.timeframe,
      candles: params.candles,
      createdAt
    })

    await fs.mkdir(join(importsRoot(), id), { recursive: true })
    await fs.writeFile(dataPath(id), params.content, 'utf8')
    await writeMeta(meta)

    return { ok: true, meta }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save import'
    return { ok: false, error: message }
  }
}

async function listImports(): Promise<ImportListResult> {
  try {
    await ensureImportsRoot()
    const entries = await fs.readdir(importsRoot(), { withFileTypes: true })
    const imports: ImportedDatasetMeta[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const meta = await readMeta(entry.name)
      if (meta) imports.push(meta)
    }

    imports.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return { ok: true, imports }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list imports'
    return { ok: false, error: message }
  }
}

async function loadImport(id: string): Promise<ImportLoadResult> {
  try {
    const meta = await readMeta(id)
    if (!meta) return { ok: false, error: 'Saved import not found.' }
    const content = await fs.readFile(dataPath(id), 'utf8')
    return { ok: true, meta, content }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load import'
    return { ok: false, error: message }
  }
}

async function deleteImport(id: string): Promise<ImportDeleteResult> {
  try {
    const dir = join(importsRoot(), id)
    await fs.rm(dir, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete import'
    return { ok: false, error: message }
  }
}

export function registerImportIpc(): void {
  ipcMain.handle('import:openDialog', async (): Promise<ImportDialogResult> => openCsvDialog())
  ipcMain.handle('import:readFile', async (_event, filePath: string): Promise<ImportReadResult> =>
    readCsvFile(String(filePath || ''))
  )
  ipcMain.handle('import:save', async (_event, params: ImportSaveParams): Promise<ImportSaveResult> =>
    saveImport(params)
  )
  ipcMain.handle('import:list', async (): Promise<ImportListResult> => listImports())
  ipcMain.handle('import:load', async (_event, id: string): Promise<ImportLoadResult> =>
    loadImport(String(id || ''))
  )
  ipcMain.handle('import:delete', async (_event, id: string): Promise<ImportDeleteResult> =>
    deleteImport(String(id || ''))
  )
}
