/** GitHub Releases, Microsoft Store, or unpackaged local Electron. */
export type UpdateChannel = 'github' | 'store' | 'dev'

/** Store listing copied onto the renderer payload (from GET /status + catalog). */
export type UpdateStoreInfo = {
  productId: string
  url: string
  webUrl: string
  liveVersion?: string | null
}

/** Payload sent when a newer release is available, or policy requires an update. */
export type UpdateAvailableInfo = {
  version: string
  releaseName: string | null
  releaseNotes: string | null
  channel: UpdateChannel
  currentVersion: string
  minVersion: string | null
  /** `latest.yml` key preserved by electron-updater (GitHub only). */
  mandatory: boolean
  /** `mandatory || unsupported` — renderer must not allow skip when true. */
  force: boolean
  /** Current build is below API `minVersion`. */
  unsupported: boolean
  /** Store channel: lock the UI and open the Microsoft Store listing. */
  blockStore: boolean
  store: UpdateStoreInfo | null
}

/** Result of `checkForUpdates` (startup + menu). */
export type UpdateCheckResult = {
  ok: boolean
  skipped?: boolean
  reason?: string
  version?: string | null
  error?: string
  channel?: UpdateChannel
  force?: boolean
  unsupported?: boolean
  blockStore?: boolean
  mandatory?: boolean
}

/** Download progress from electron-updater. */
export type UpdateProgressInfo = {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export type UpdateDownloadedInfo = {
  version: string
}

export type UpdateErrorInfo = {
  message: string
}
