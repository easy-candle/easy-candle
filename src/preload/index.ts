import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppRuntime } from '@shared/ipc/api'
import { IPC_CHANNELS, type IpcChannel } from '@shared/ipc/channels'
import type {
  ImportDeleteResult,
  ImportDialogResult,
  ImportListResult,
  ImportLoadRange,
  ImportLoadResult,
  ImportParseResult,
  ImportReadResult,
  ImportSaveParams,
  ImportSaveResult
} from '@shared/importTypes'
import type { ImportJobProgress } from '@shared/importJobProgress'
import type { KlinesFetchParams, KlinesFetchResult } from '@shared/klinesTypes'
import type {
  MtBridgeIpcEvent,
  MtBridgeStatusResult,
  MtPreviewLoadResult
} from '@shared/mtBridgeTypes'
import type { AccountSession, AuthResult, RedeemResult } from '@shared/accountTypes'
import type {
  UpdateAvailableInfo,
  UpdateDownloadedInfo,
  UpdateErrorInfo,
  UpdateProgressInfo
} from '@shared/updaterTypes'

function subscribe<T>(channel: IpcChannel, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => {
    callback(payload)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  // Widened on purpose: the web bridge exposes the same surface with 'web'.
  runtime: 'desktop' as AppRuntime,
  fetchKlines: (params: KlinesFetchParams): Promise<KlinesFetchResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.KLINES_FETCH, params),
  mtBridgeStart: (): Promise<MtBridgeStatusResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MT_BRIDGE_START),
  mtBridgeStop: (): Promise<MtBridgeStatusResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MT_BRIDGE_STOP),
  mtBridgeStatus: (): Promise<MtBridgeStatusResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MT_BRIDGE_STATUS),
  mtBridgePreview: (): Promise<MtPreviewLoadResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.MT_BRIDGE_PREVIEW),
  onMtBridgeEvent: (callback: (payload: MtBridgeIpcEvent) => void): (() => void) =>
    subscribe(IPC_CHANNELS.MT_BRIDGE_EVENT, callback),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  minimizeWindow: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
  toggleMaximizeWindow: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  closeWindow: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  onWindowMaximizedChange: (callback: (maximized: boolean) => void): (() => void) =>
    subscribe(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, callback),
  notifyStartupReady: (): void => ipcRenderer.send(IPC_CHANNELS.WINDOW_STARTUP_READY),
  openImportDialog: (): Promise<ImportDialogResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_OPEN_DIALOG),
  readImportFile: (path: string): Promise<ImportReadResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_READ_FILE, path),
  parseImportFile: (path: string): Promise<ImportParseResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_PARSE_FILE, path),
  discardImportParse: (token: string): Promise<{ ok: true }> =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_DISCARD_PARSE, token),
  saveImport: (params: ImportSaveParams): Promise<ImportSaveResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_SAVE, params),
  listImports: (): Promise<ImportListResult> => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_LIST),
  loadImport: (
    id: string,
    timeframe?: string,
    range?: ImportLoadRange
  ): Promise<ImportLoadResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_LOAD, id, timeframe, range),
  deleteImport: (id: string): Promise<ImportDeleteResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_DELETE, id),
  onImportJobProgress: (callback: (progress: ImportJobProgress) => void): (() => void) =>
    subscribe(IPC_CHANNELS.IMPORT_JOB_PROGRESS, callback),
  checkForUpdates: (): Promise<{
    ok: boolean
    skipped?: boolean
    version?: string | null
    error?: string
  }> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
  downloadUpdate: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),
  installUpdate: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
  onUpdateAvailable: (callback: (info: UpdateAvailableInfo) => void): (() => void) =>
    subscribe(IPC_CHANNELS.UPDATE_AVAILABLE, callback),
  onUpdateProgress: (callback: (info: UpdateProgressInfo) => void): (() => void) =>
    subscribe(IPC_CHANNELS.UPDATE_PROGRESS, callback),
  onUpdateDownloaded: (callback: (info: UpdateDownloadedInfo) => void): (() => void) =>
    subscribe(IPC_CHANNELS.UPDATE_DOWNLOADED, callback),
  onUpdateError: (callback: (info: UpdateErrorInfo) => void): (() => void) =>
    subscribe(IPC_CHANNELS.UPDATE_ERROR, callback),
  authSession: (): Promise<AccountSession> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_SESSION),
  authGoogleStart: (): Promise<AuthResult> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GOOGLE_START),
  authLogout: (): Promise<AuthResult> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
  authRefresh: (): Promise<AuthResult> => ipcRenderer.invoke(IPC_CHANNELS.AUTH_REFRESH),
  authRedeemCode: (code: string): Promise<RedeemResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_REDEEM, code)
}

/**
 * The renderer-facing API contract, derived from the implementation above so the
 * two can never drift. `webApiBridge` checks itself against this same type.
 */
export type EasyCandleApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // Types come from the global Window augmentation in index.d.ts.
  window.electron = electronAPI
  window.api = api
}
