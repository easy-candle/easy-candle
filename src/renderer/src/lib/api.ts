import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type {
  ImportDeleteResult,
  ImportDialogResult,
  ImportListResult,
  ImportLoadResult,
  ImportReadResult,
  ImportSaveParams,
  ImportSaveResult
} from '@shared/importTypes'
import type { KlinesFetchParams, KlinesFetchResult } from '@shared/klinesTypes'

const isTauri = '__TAURI_INTERNALS__' in globalThis

const TAURI_UNAVAILABLE = 'Tauri runtime is not available in this environment'

const safeInvoke = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
  isTauri ? tauriInvoke(cmd, args) : Promise.reject(new Error(TAURI_UNAVAILABLE))

const getAppWindow = (): ReturnType<typeof getCurrentWindow> | null =>
  isTauri ? getCurrentWindow() : null

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').pop() || ''
}

/**
 * Domain API backed by Tauri commands and plugins.
 * Replaces the Electron `window.api` preload bridge.
 */
export const api = {
  fetchKlines: (params: KlinesFetchParams): Promise<KlinesFetchResult> =>
    isTauri
      ? safeInvoke<KlinesFetchResult>('klines_fetch', { params })
      : Promise.resolve({ ok: false, status: 0, error: TAURI_UNAVAILABLE }),

  getAppVersion: (): Promise<string> => (isTauri ? getVersion() : Promise.resolve('dev')),

  minimizeWindow: (): void => {
    getAppWindow()?.minimize()
  },
  toggleMaximizeWindow: (): void => {
    getAppWindow()?.toggleMaximize()
  },
  closeWindow: (): void => {
    getAppWindow()?.close()
  },
  isWindowMaximized: (): Promise<boolean> =>
    getAppWindow() ? getAppWindow()!.isMaximized() : Promise.resolve(false),
  onWindowMaximizedChange: (callback: (maximized: boolean) => void): (() => void) => {
    const appWindow = getAppWindow()
    if (!appWindow) return () => undefined
    const disposers: (() => void)[] = []
    const watch = (): void => {
      void appWindow.isMaximized().then(callback)
    }
    void appWindow.onResized(watch).then((fn) => disposers.push(fn))
    void appWindow.onMoved(watch).then((fn) => disposers.push(fn))
    return () => {
      for (const dispose of disposers) dispose()
    }
  },

  openImportDialog: async (): Promise<ImportDialogResult> => {
    try {
      const path = await openDialog({
        title: 'Import MT4/MT5 1-minute candles',
        multiple: false,
        directory: false,
        filters: [
          { name: 'CSV / TXT', extensions: ['csv', 'txt'] },
          { name: 'All files', extensions: ['*'] }
        ]
      })
      if (!path) return { ok: false, canceled: true }
      return { ok: true, path: String(path), fileName: fileNameFromPath(String(path)) }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open file dialog'
      return { ok: false, error: message }
    }
  },

  readImportFile: (path: string): Promise<ImportReadResult> =>
    isTauri
      ? safeInvoke<ImportReadResult>('import_read_file', { path })
      : Promise.resolve({ ok: false, error: TAURI_UNAVAILABLE }),

  saveImport: (params: ImportSaveParams): Promise<ImportSaveResult> =>
    isTauri
      ? safeInvoke<ImportSaveResult>('import_save', {
          content: params.content,
          originalFileName: params.originalFileName,
          symbol: params.symbol,
          candlesByTimeframe: params.candlesByTimeframe,
          replaceId: params.replaceId
        })
      : Promise.resolve({ ok: false, error: TAURI_UNAVAILABLE }),

  listImports: (): Promise<ImportListResult> =>
    isTauri ? safeInvoke<ImportListResult>('import_list') : Promise.resolve({ ok: true, imports: [] }),

  loadImport: (id: string, timeframe?: string): Promise<ImportLoadResult> =>
    isTauri
      ? safeInvoke<ImportLoadResult>('import_load', { id, timeframe })
      : Promise.resolve({ ok: false, error: TAURI_UNAVAILABLE }),

  deleteImport: (id: string): Promise<ImportDeleteResult> =>
    isTauri
      ? safeInvoke<ImportDeleteResult>('import_delete', { id })
      : Promise.resolve({ ok: false, error: TAURI_UNAVAILABLE })
}
