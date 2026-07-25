import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { KlinesFetchParams, KlinesFetchResult } from '../shared/klinesTypes'

const api = {
  fetchKlines: (params: KlinesFetchParams): Promise<KlinesFetchResult> =>
    ipcRenderer.invoke('klines:fetch', params)
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
