/**
 * Import progress contract shared by workers, IPC, and the progress bar UI.
 *
 * Build stages match the confirm-modal bar:
 * 0–53% 5m, 55% 15m, 57% 1h, 59% 4h, 61% 1d, 63% ready,
 * 78% saving, 94% loading chart, 100% done.
 */

export const IMPORT_WORKER_PROGRESS_EVERY = 50_000

export const IMPORT_BUILD_UI_PERCENT = {
  tf5mStart: 0,
  tf5mEnd: 53,
  tf15m: 55,
  tf1h: 57,
  tf4h: 59,
  tf1d: 61,
  ready: 63,
  saving: 78,
  loadingChart: 94,
  done: 100
} as const

export const IMPORT_BUILD_STAGE_PERCENT: Record<string, number> = {
  '5m': IMPORT_BUILD_UI_PERCENT.tf5mEnd,
  '15m': IMPORT_BUILD_UI_PERCENT.tf15m,
  '1h': IMPORT_BUILD_UI_PERCENT.tf1h,
  '4h': IMPORT_BUILD_UI_PERCENT.tf4h,
  '1d': IMPORT_BUILD_UI_PERCENT.tf1d
}

export type ImportJobKind = 'parse' | 'build' | 'save'

export type ImportJobProgress = {
  job: ImportJobKind
  phase: string
  percent: number
  processedRows?: number
  totalRows?: number
}
