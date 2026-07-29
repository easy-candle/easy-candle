import { ElectronAPI } from '@electron-toolkit/preload'
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
