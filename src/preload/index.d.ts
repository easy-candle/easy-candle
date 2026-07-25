import { ElectronAPI } from '@electron-toolkit/preload'
import type { KlinesFetchParams, KlinesFetchResult } from '../shared/klinesTypes'

interface EasyCandleApi {
  fetchKlines: (params: KlinesFetchParams) => Promise<KlinesFetchResult>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: EasyCandleApi
  }
}

export {}
