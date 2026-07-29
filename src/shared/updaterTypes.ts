/** Payload sent when a newer release is available on GitHub. */
export type UpdateAvailableInfo = {
  version: string
  releaseName: string | null
  releaseNotes: string | null
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
