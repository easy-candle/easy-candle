import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type {
  UpdateAvailableInfo,
  UpdateDownloadedInfo,
  UpdateErrorInfo,
  UpdateProgressInfo
} from '../shared/updaterTypes'

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

function notesToString(notes: string | null | undefined | Array<unknown>): string | null {
  if (notes == null) return null
  if (typeof notes === 'string') return notes.trim() || null
  if (Array.isArray(notes)) {
    const text = notes
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'note' in item) {
          return String((item as { note?: unknown }).note ?? '')
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()
    return text || null
  }
  return null
}

/** Wire electron-updater: confirm-before-download, progress, and restart install. */
export function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    // Still expose no-op handlers so the renderer API is stable in dev.
    ipcMain.handle('update:check', async () => ({ ok: true, skipped: true }))
    ipcMain.handle('update:download', async () => ({ ok: false, error: 'Updates disabled in dev' }))
    ipcMain.handle('update:install', async () => ({ ok: false, error: 'Updates disabled in dev' }))
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    const payload: UpdateAvailableInfo = {
      version: info.version,
      releaseName: info.releaseName ?? null,
      releaseNotes: notesToString(info.releaseNotes as string | null | undefined | Array<unknown>)
    }
    broadcast('update:available', payload)
  })

  autoUpdater.on('download-progress', (progress) => {
    const payload: UpdateProgressInfo = {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    }
    broadcast('update:progress', payload)
  })

  autoUpdater.on('update-downloaded', (info) => {
    const payload: UpdateDownloadedInfo = {
      version: info.version
    }
    broadcast('update:downloaded', payload)
  })

  autoUpdater.on('error', (error) => {
    const payload: UpdateErrorInfo = {
      message: error?.message || String(error)
    }
    console.error('[autoUpdater]', error)
    broadcast('update:error', payload)
  })

  ipcMain.handle('update:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return { ok: true, version: result?.updateInfo?.version ?? null }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[autoUpdater] check failed', error)
      return { ok: false, error: message }
    }
  })

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[autoUpdater] download failed', error)
      return { ok: false, error: message }
    }
  })

  ipcMain.handle('update:install', () => {
    // Let the renderer close the modal; quitAndInstall exits the process.
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true)
    })
    return { ok: true }
  })
}
