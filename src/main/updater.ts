import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

/** Check for updates in packaged builds only. */
export function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (error) => {
    console.error('[autoUpdater]', error)
  })

  void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error('[autoUpdater] check failed', error)
  })
}
