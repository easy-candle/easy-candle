import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ImportDeleteResult,
  ImportDialogResult,
  ImportListResult,
  ImportLoadResult,
  ImportReadResult,
  ImportSaveParams,
  ImportSaveResult
} from '../shared/importTypes'
import type { KlinesFetchParams, KlinesFetchResult } from '../shared/klinesTypes'
import type { MtBridgeIpcEvent, MtBridgeStatusResult, MtPreviewLoadResult } from '../shared/mtBridgeTypes'
import type {
  UpdateAvailableInfo,
  UpdateDownloadedInfo,
  UpdateErrorInfo,
  UpdateProgressInfo
} from '../shared/updaterTypes'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => {
    callback(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  fetchKlines: (params: KlinesFetchParams): Promise<KlinesFetchResult> =>
    ipcRenderer.invoke('klines:fetch', params),
  mtBridgeStart: (): Promise<MtBridgeStatusResult> => ipcRenderer.invoke('mtbridge:start'),
  mtBridgeStop: (): Promise<MtBridgeStatusResult> => ipcRenderer.invoke('mtbridge:stop'),
  mtBridgeStatus: (): Promise<MtBridgeStatusResult> => ipcRenderer.invoke('mtbridge:status'),
  mtBridgePreview: (): Promise<MtPreviewLoadResult> => ipcRenderer.invoke('mtbridge:preview'),
  onMtBridgeEvent: (callback: (payload: MtBridgeIpcEvent) => void): (() => void) =>
    subscribe('mtbridge:event', callback),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  minimizeWindow: (): void => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: (): void => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: (): void => ipcRenderer.send('window:close'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximizedChange: (callback: (maximized: boolean) => void): (() => void) =>
    subscribe('window:maximized-changed', callback),
  openImportDialog: (): Promise<ImportDialogResult> => ipcRenderer.invoke('import:openDialog'),
  readImportFile: (path: string): Promise<ImportReadResult> =>
    ipcRenderer.invoke('import:readFile', path),
  saveImport: (params: ImportSaveParams): Promise<ImportSaveResult> =>
    ipcRenderer.invoke('import:save', params),
  listImports: (): Promise<ImportListResult> => ipcRenderer.invoke('import:list'),
  loadImport: (id: string, timeframe?: string): Promise<ImportLoadResult> =>
    ipcRenderer.invoke('import:load', id, timeframe),
  deleteImport: (id: string): Promise<ImportDeleteResult> =>
    ipcRenderer.invoke('import:delete', id),
  checkForUpdates: (): Promise<{
    ok: boolean
    skipped?: boolean
    version?: string | null
    error?: string
  }> => ipcRenderer.invoke('update:check'),
  downloadUpdate: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('update:download'),
  installUpdate: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('update:install'),
  onUpdateAvailable: (callback: (info: UpdateAvailableInfo) => void): (() => void) =>
    subscribe('update:available', callback),
  onUpdateProgress: (callback: (info: UpdateProgressInfo) => void): (() => void) =>
    subscribe('update:progress', callback),
  onUpdateDownloaded: (callback: (info: UpdateDownloadedInfo) => void): (() => void) =>
    subscribe('update:downloaded', callback),
  onUpdateError: (callback: (info: UpdateErrorInfo) => void): (() => void) =>
    subscribe('update:error', callback)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error fallback when contextIsolation is disabled
  window.electron = electronAPI
  // @ts-expect-error fallback when contextIsolation is disabled
  window.api = api
}
