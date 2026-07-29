import { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import type {
  UpdateAvailableInfo,
  UpdateDownloadedInfo,
  UpdateErrorInfo,
  UpdateProgressInfo
} from '@shared/updaterTypes'

type Phase = 'hidden' | 'available' | 'downloading' | 'downloaded' | 'error'

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export default function UpdateModal() {
  const [phase, setPhase] = useState<Phase>('hidden')
  const [info, setInfo] = useState<UpdateAvailableInfo | null>(null)
  const [progress, setProgress] = useState<UpdateProgressInfo | null>(null)
  const [downloaded, setDownloaded] = useState<UpdateDownloadedInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const offAvailable = window.api.onUpdateAvailable((next) => {
      setInfo(next)
      setProgress(null)
      setDownloaded(null)
      setError(null)
      setPhase('available')
    })
    const offProgress = window.api.onUpdateProgress((next) => {
      setProgress(next)
      setPhase('downloading')
    })
    const offDownloaded = window.api.onUpdateDownloaded((next) => {
      setDownloaded(next)
      setProgress((prev) =>
        prev
          ? { ...prev, percent: 100 }
          : { percent: 100, transferred: 0, total: 0, bytesPerSecond: 0 }
      )
      setPhase('downloaded')
      setBusy(false)
    })
    const offError = window.api.onUpdateError((next: UpdateErrorInfo) => {
      setError(next.message)
      setPhase('error')
      setBusy(false)
    })

    void window.api.checkForUpdates()

    return () => {
      offAvailable()
      offProgress()
      offDownloaded()
      offError()
    }
  }, [])

  if (phase === 'hidden') return null

  const version = downloaded?.version || info?.version || ''
  const percent = Math.max(0, Math.min(100, progress?.percent ?? 0))

  async function onDownload(): Promise<void> {
    setBusy(true)
    setError(null)
    setPhase('downloading')
    const result = await window.api.downloadUpdate()
    if (!result.ok) {
      setError(result.error || 'Download failed')
      setPhase('error')
      setBusy(false)
    }
  }

  async function onInstall(): Promise<void> {
    setBusy(true)
    await window.api.installUpdate()
  }

  function onLater(): void {
    setPhase('hidden')
    setBusy(false)
  }

  function onDismissError(): void {
    setPhase('hidden')
    setError(null)
    setBusy(false)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
        className="flex w-full max-w-md flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 id="update-modal-title" className="text-sm font-semibold text-amber-400">
              {phase === 'downloaded'
                ? 'Update ready'
                : phase === 'downloading'
                  ? 'Downloading update'
                  : phase === 'error'
                    ? 'Update failed'
                    : 'Update available'}
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {phase === 'error'
                ? 'Something went wrong while updating.'
                : version
                  ? `Version ${version}`
                  : 'A newer Easy Candle build is available.'}
            </p>
          </div>
          {(phase === 'available' || phase === 'error' || phase === 'downloaded') && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={phase === 'error' ? onDismissError : onLater}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-3 px-4 py-3 text-sm text-zinc-300">
          {phase === 'available' && (
            <>
              <p className="text-xs leading-relaxed text-zinc-400">
                A new release is ready to download. You can update now or keep using this version and
                install later when you quit.
              </p>
              {info?.releaseNotes ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900/60 p-2 text-[11px] leading-relaxed text-zinc-400">
                  {info.releaseNotes}
                </pre>
              ) : null}
            </>
          )}

          {phase === 'downloading' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] tabular-nums text-zinc-500">
                <span>{percent.toFixed(0)}%</span>
                <span>
                  {progress
                    ? `${formatBytes(progress.transferred)} / ${formatBytes(progress.total)}`
                    : 'Starting…'}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded bg-zinc-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
              >
                <div
                  className="h-full rounded bg-amber-500 transition-[width] duration-150"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {progress && progress.bytesPerSecond > 0 ? (
                <p className="text-[11px] text-zinc-600">
                  {formatBytes(progress.bytesPerSecond)}/s
                </p>
              ) : null}
            </div>
          )}

          {phase === 'downloaded' && (
            <p className="text-xs leading-relaxed text-zinc-400">
              The update downloaded successfully. Restart Easy Candle to install it now, or continue
              working — it will install when you quit.
            </p>
          )}

          {phase === 'error' && (
            <p className="rounded border border-red-900/50 bg-red-950/40 px-2.5 py-2 text-xs text-red-300">
              {error || 'Unknown update error'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          {phase === 'available' && (
            <>
              <button
                type="button"
                onClick={onLater}
                disabled={busy}
                className="inline-flex h-8 items-center rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-50"
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => void onDownload()}
                disabled={busy}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download update
              </button>
            </>
          )}

          {phase === 'downloading' && (
            <span className="text-[11px] text-zinc-500">Please wait while the update downloads…</span>
          )}

          {phase === 'downloaded' && (
            <>
              <button
                type="button"
                onClick={onLater}
                disabled={busy}
                className="inline-flex h-8 items-center rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-50"
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => void onInstall()}
                disabled={busy}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Restart now
              </button>
            </>
          )}

          {phase === 'error' && (
            <button
              type="button"
              onClick={onDismissError}
              className="inline-flex h-8 items-center rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
