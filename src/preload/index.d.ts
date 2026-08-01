import { ElectronAPI } from '@electron-toolkit/preload'
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
import type {
  UpdateAvailableInfo,
  UpdateDownloadedInfo,
  UpdateErrorInfo,
  UpdateProgressInfo
} from '../shared/updaterTypes'

interface EasyCandleApi {
  fetchKlines: (params: KlinesFetchParams) => Promise<KlinesFetchResult>
  getAppVersion: () => Promise<string>
  openImportDialog: () => Promise<ImportDialogResult>
  readImportFile: (path: string) => Promise<ImportReadResult>
  saveImport: (params: ImportSaveParams) => Promise<ImportSaveResult>
  listImports: () => Promise<ImportListResult>
  loadImport: (id: string) => Promise<ImportLoadResult>
  deleteImport: (id: string) => Promise<ImportDeleteResult>
  checkForUpdates: () => Promise<{
    ok: boolean
    skipped?: boolean
    version?: string | null
    error?: string
  }>
  downloadUpdate: () => Promise<{ ok: boolean; error?: string }>
  installUpdate: () => Promise<{ ok: boolean; error?: string }>
  onUpdateAvailable: (callback: (info: UpdateAvailableInfo) => void) => () => void
  onUpdateProgress: (callback: (info: UpdateProgressInfo) => void) => () => void
  onUpdateDownloaded: (callback: (info: UpdateDownloadedInfo) => void) => () => void
  onUpdateError: (callback: (info: UpdateErrorInfo) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: EasyCandleApi
  }
}

export {}
