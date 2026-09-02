import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateInfo } from 'electron-updater'
import { setApiClientIdentity } from '@shared/accountApi'
import { apiFetchStatus, type AppStatus } from '@shared/appStatus'
import { IPC_CHANNELS, type IpcChannel } from '@shared/ipc/channels'
import { semverLt } from '@shared/semver'
import type {
  UpdateAvailableInfo,
  UpdateCheckResult,
  UpdateChannel,
  UpdateDownloadedInfo,
  UpdateErrorInfo,
  UpdateProgressInfo,
  UpdateStoreInfo
} from '@shared/updaterTypes'
import { fetchStoreLiveVersion, STORE_PRODUCT_ID } from './storeCatalog'
import { evaluateUpdatePolicy, type UpdatePolicyResult } from './updatePolicy'

const DEFAULT_STORE_URL = `ms-windows-store://pdp/?productid=${STORE_PRODUCT_ID}`
const DEFAULT_STORE_WEB_URL = `https://apps.microsoft.com/detail/${STORE_PRODUCT_ID}`

let lastStatus: AppStatus | null = null
let lastPolicy: UpdatePolicyResult | null = null
let availableEmittedThisCheck = false

function broadcast(channel: IpcChannel, payload?: unknown): void {
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

function resolveUpdateChannel(): UpdateChannel {
  if (!app.isPackaged) return 'dev'
  if (process.windowsStore) return 'store'
  return 'github'
}

function ymlMandatory(info: UpdateInfo | null | undefined): boolean {
  if (!info || typeof info !== 'object') return false
  const value = (info as UpdateInfo & { mandatory?: unknown }).mandatory
  return value === true || value === 'true'
}

function storeInfoFromPolicy(policy: UpdatePolicyResult): UpdateStoreInfo | null {
  if (policy.store) {
    return {
      productId: policy.store.productId,
      url: policy.store.url,
      webUrl: policy.store.webUrl,
      liveVersion: policy.storeLiveVersion ?? policy.store.liveVersion ?? null
    }
  }
  if (policy.storeLiveVersion) {
    return {
      productId: STORE_PRODUCT_ID,
      url: DEFAULT_STORE_URL,
      webUrl: DEFAULT_STORE_WEB_URL,
      liveVersion: policy.storeLiveVersion
    }
  }
  return null
}

function buildAvailableInfo(
  policy: UpdatePolicyResult,
  extras?: {
    version?: string
    releaseName?: string | null
    releaseNotes?: string | null
  }
): UpdateAvailableInfo {
  const version =
    extras?.version || policy.storeLiveVersion || policy.minVersion || policy.currentVersion
  return {
    version,
    releaseName: extras?.releaseName ?? null,
    releaseNotes: extras?.releaseNotes ?? null,
    channel: policy.channel,
    currentVersion: policy.currentVersion,
    minVersion: policy.minVersion,
    mandatory: policy.mandatory,
    force: policy.force,
    unsupported: policy.unsupported,
    blockStore: policy.blockStore,
    store: storeInfoFromPolicy(policy)
  }
}

function checkResultFromPolicy(
  policy: UpdatePolicyResult,
  extras?: Partial<UpdateCheckResult>
): UpdateCheckResult {
  return {
    ok: extras?.ok ?? true,
    skipped: extras?.skipped,
    reason: extras?.reason,
    version: extras?.version ?? null,
    error: extras?.error,
    channel: policy.channel,
    force: policy.force,
    unsupported: policy.unsupported,
    blockStore: policy.blockStore,
    mandatory: policy.mandatory
  }
}

function shouldBroadcastPolicy(policy: UpdatePolicyResult): boolean {
  if (policy.channel === 'store') return policy.blockStore
  return policy.force || policy.unsupported
}

async function loadStatus(): Promise<AppStatus | null> {
  try {
    const result = await apiFetchStatus()
    return result.ok === true ? result : null
  } catch (error) {
    console.error('[autoUpdater] status fetch failed', error)
    return null
  }
}

async function loadStoreLiveVersion(productId?: string): Promise<string | null> {
  try {
    return await fetchStoreLiveVersion(productId || STORE_PRODUCT_ID)
  } catch (error) {
    console.error('[autoUpdater] store catalog fetch failed', error)
    return null
  }
}

async function openMicrosoftStore(): Promise<{ ok: boolean; error?: string }> {
  const store = lastPolicy?.store ?? lastStatus?.store
  const protocolUrl = store?.url || DEFAULT_STORE_URL
  const webUrl = store?.webUrl || DEFAULT_STORE_WEB_URL
  try {
    await shell.openExternal(protocolUrl)
    return { ok: true }
  } catch {
    try {
      await shell.openExternal(webUrl)
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  }
}

function registerGithubUpdater(channel: UpdateChannel): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    availableEmittedThisCheck = true
    const policy = evaluateUpdatePolicy({
      channel,
      currentVersion: app.getVersion(),
      status: lastStatus,
      mandatory: ymlMandatory(info)
    })
    lastPolicy = policy
    const payload = buildAvailableInfo(policy, {
      version: info.version,
      releaseName: info.releaseName ?? null,
      releaseNotes: notesToString(info.releaseNotes as string | null | undefined | Array<unknown>)
    })
    broadcast(IPC_CHANNELS.UPDATE_AVAILABLE, payload)
  })

  autoUpdater.on('download-progress', (progress) => {
    const payload: UpdateProgressInfo = {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    }
    broadcast(IPC_CHANNELS.UPDATE_PROGRESS, payload)
  })

  autoUpdater.on('update-downloaded', (info) => {
    const payload: UpdateDownloadedInfo = {
      version: info.version
    }
    broadcast(IPC_CHANNELS.UPDATE_DOWNLOADED, payload)
  })

  autoUpdater.on('error', (error) => {
    const payload: UpdateErrorInfo = {
      message: error?.message || String(error)
    }
    console.error('[autoUpdater]', error)
    broadcast(IPC_CHANNELS.UPDATE_ERROR, payload)
  })
}

async function runUpdateCheck(channel: UpdateChannel): Promise<UpdateCheckResult> {
  availableEmittedThisCheck = false
  const currentVersion = app.getVersion()
  const status = await loadStatus()
  lastStatus = status

  const storeLiveVersion =
    channel === 'store' ? await loadStoreLiveVersion(status?.store.productId) : null

  if (channel === 'github') {
    try {
      const result = await autoUpdater.checkForUpdates()
      const policy = evaluateUpdatePolicy({
        channel,
        currentVersion,
        status,
        mandatory: ymlMandatory(result?.updateInfo),
        storeLiveVersion
      })
      lastPolicy = policy
      if (!availableEmittedThisCheck && shouldBroadcastPolicy(policy)) {
        broadcast(
          IPC_CHANNELS.UPDATE_AVAILABLE,
          buildAvailableInfo(policy, { version: result?.updateInfo?.version })
        )
      }
      const newer = result?.isUpdateAvailable === true
      const version = newer && result?.updateInfo?.version ? result.updateInfo.version : null
      return checkResultFromPolicy(policy, { version })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[autoUpdater] check failed', error)
      const policy = evaluateUpdatePolicy({
        channel,
        currentVersion,
        status,
        mandatory: false,
        storeLiveVersion
      })
      lastPolicy = policy
      if (shouldBroadcastPolicy(policy)) {
        broadcast(IPC_CHANNELS.UPDATE_AVAILABLE, buildAvailableInfo(policy))
      }
      return checkResultFromPolicy(policy, { ok: false, error: message })
    }
  }

  const policy = evaluateUpdatePolicy({
    channel,
    currentVersion,
    status,
    mandatory: false,
    storeLiveVersion
  })
  lastPolicy = policy

  if (shouldBroadcastPolicy(policy)) {
    broadcast(IPC_CHANNELS.UPDATE_AVAILABLE, buildAvailableInfo(policy))
  }

  if (channel === 'dev' && !policy.force && !policy.unsupported) {
    return checkResultFromPolicy(policy, { skipped: true, reason: 'dev' })
  }

  const version =
    storeLiveVersion && semverLt(currentVersion, storeLiveVersion) ? storeLiveVersion : null
  return checkResultFromPolicy(policy, { version })
}

/** Wire electron-updater: confirm-before-download, progress, and restart install. */
export function setupAutoUpdater(): void {
  const channel = resolveUpdateChannel()
  setApiClientIdentity(app.getVersion(), channel)

  if (channel === 'github') {
    registerGithubUpdater(channel)
  }

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => runUpdateCheck(channel))

  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => {
    if (channel !== 'github') {
      return {
        ok: false,
        error:
          channel === 'store'
            ? 'Install updates from the Microsoft Store'
            : 'Updates disabled (dev)'
      }
    }
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[autoUpdater] download failed', error)
      return { ok: false, error: message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    if (channel !== 'github') {
      return {
        ok: false,
        error:
          channel === 'store'
            ? 'Install updates from the Microsoft Store'
            : 'Updates disabled (dev)'
      }
    }
    // Let the renderer close the modal; quitAndInstall exits the process.
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true)
    })
    return { ok: true }
  })

  ipcMain.handle(IPC_CHANNELS.UPDATE_OPEN_STORE, () => openMicrosoftStore())
}
