import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import { fetchKlinesResult } from '@shared/klinesService'
import type { KlinesFetchParams } from '@shared/klinesTypes'

export function registerKlinesIpc(): void {
  ipcMain.handle(IPC_CHANNELS.KLINES_FETCH, async (_event, params: KlinesFetchParams) =>
    fetchKlinesResult(params)
  )
}
