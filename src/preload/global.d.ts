import type { ElectronAPI } from '@electron-toolkit/preload'
import type { EasyCandleApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: EasyCandleApi
  }
}

export {}
