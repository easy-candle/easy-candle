import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Download, ExternalLink, RefreshCw, X } from 'lucide-react'
import type {
  UpdateAvailableInfo,
  UpdateDownloadedInfo,
  UpdateErrorInfo,
  UpdateProgressInfo
} from '@shared/updaterTypes'
import { parseReleaseNotes } from '@/lib/releaseNotes'

type Phase = 'hidden' | 'available' | 'downloading' | 'downloaded' | 'error'
type UpdateChannel = 'github' | 'store' | 'dev'

/** Planned Task F extensions on UpdateAvailableInfo (and store policy payload). */
type UpdatePolicyInfo = UpdateAvailableInfo & {
  mandatory?: boolean
  unsupported?: boolean
  force?: boolean
  currentVersion?: string
  minVersion?: string
  channel?: UpdateChannel
  blockStore?: boolean
  productId?: string
  liveVersion?: string
  storeUrl?: string
  storeWebUrl?: string
  store?: {
    productId?: string
    url?: string
    webUrl?: string
    liveVersion?: string
  }
}

type PlannedUpdaterApi = {
  openStore?: () => Promise<{ ok: boolean; error?: string } | void>
  openMicrosoftStore?: () => Promise<{ ok: boolean; error?: string } | void>
}

function asPolicy(info: UpdateAvailableInfo): UpdatePolicyInfo {
  return info as UpdatePolicyInfo
}

function isStoreChannel(info: UpdatePolicyInfo | null): boolean {
  if (!info) return false
  return (
    info.channel === 'store' ||
    info.blockStore === true ||
    Boolean(info.store?.productId || info.productId)
  )
}

/** Store blocks only when Task F/E set `blockStore` — catalog-not-live is fail-open. */
function isStoreBlock(info: UpdatePolicyInfo | null): boolean {
  return Boolean(info?.blockStore)
}

function isForceLock(info: UpdatePolicyInfo | null): boolean {
  if (!info) return false
  if (info.blockStore) return true
  if (isStoreChannel(info)) return false
  return Boolean(info.force ?? (info.mandatory || info.unsupported))
}

function unsupportedCopy(info: UpdatePolicyInfo | null): string {
  const current = info?.currentVersion || (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '')
  return current
    ? `Current app version ${current} is not supported and must be updated.`
    : 'Current app version is not supported and must be updated.'
}

async function openMicrosoftStore(): Promise<void> {
  const api = window.api as typeof window.api & PlannedUpdaterApi
  if (typeof api.openStore === 'function') {
    await api.openStore()
    return
  }
  if (typeof api.openMicrosoftStore === 'function') {
    await api.openMicrosoftStore()
  }
}

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

const notesBoxClass =
  'max-h-52 overflow-auto rounded border border-zinc-800 bg-zinc-900/60 p-2.5 text-[11px] leading-relaxed text-zinc-400'

function ReleaseNotes({ notes }: { notes: string }) {
  const parsed = useMemo(() => parseReleaseNotes(notes), [notes])

  function onHtmlClick(event: MouseEvent<HTMLDivElement>): void {
    const anchor = (event.target as HTMLElement | null)?.closest?.('a')
    if (!anchor) return
    event.preventDefault()
    const href = anchor.getAttribute('href')
    if (href) window.open(href, '_blank', 'noopener,noreferrer')
  }

  return (
    <div>
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        What&apos;s new
      </p>
      {parsed.kind === 'html' ? (
        <div
          className={`${notesBoxClass} release-notes-html`}
          dangerouslySetInnerHTML={{ __html: parsed.html }}
          onClick={onHtmlClick}
        />
      ) : (
        <pre className={`${notesBoxClass} whitespace-pre-wrap`}>{parsed.text}</pre>
      )}
    </div>
  )
}

export default function UpdateModal() {
  const [phase, setPhase] = useState<Phase>('hidden')
  const [info, setInfo] = useState<UpdatePolicyInfo | null>(null)
  const [progress, setProgress] = useState<UpdateProgressInfo | null>(null)
  const [downloaded, setDownloaded] = useState<UpdateDownloadedInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const offAvailable = window.api.onUpdateAvailable((next) => {
      const policy = asPolicy(next)
      // Store: only full-screen block when policy says so. Catalog-not-live is fail-open.
      if (isStoreChannel(policy) && !isStoreBlock(policy)) return
      setInfo(policy)
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

  const storeBlock = isStoreBlock(info)
  const force = isForceLock(info) || storeBlock
  const unsupported = Boolean(info?.unsupported) || storeBlock
  const canDismiss = !force && (phase === 'available' || phase === 'error' || phase === 'downloaded')

  useEffect(() => {
    if (!canDismiss) return

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      if (phase === 'error') {
        setPhase('hidden')
        setError(null)
        setBusy(false)
        return
      }
      setPhase('hidden')
      setBusy(false)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [canDismiss, phase])

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
    if (force) return
    setPhase('hidden')
    setBusy(false)
  }

  function onDismissError(): void {
    if (force) return
    setPhase('hidden')
    setError(null)
    setBusy(false)
  }

  async function onRetry(): Promise<void> {
    setBusy(true)
    setError(null)
    if (storeBlock) {
      await window.api.checkForUpdates()
      setBusy(false)
      return
    }
    await onDownload()
  }

  async function onOpenStore(): Promise<void> {
    setBusy(true)
    await openMicrosoftStore()
    setBusy(false)
  }

  const title =
    phase === 'downloaded'
      ? 'Update ready'
      : phase === 'downloading'
        ? 'Downloading update'
        : phase === 'error'
          ? 'Update failed'
          : unsupported
            ? 'Update required'
            : 'Update available'

  const subtitle =
    phase === 'error'
      ? 'Something went wrong while updating.'
      : version
        ? `Version ${version}`
        : 'A newer Easy Candle build is available.'

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 ${
        storeBlock ? 'bg-zinc-950' : 'bg-black/70'
      }`}
      role="presentation"
      onClick={canDismiss ? (phase === 'error' ? onDismissError : onLater) : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
        className={`flex w-full flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50 ${
          storeBlock ? 'max-w-xl' : 'max-w-lg'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 id="update-modal-title" className="text-sm font-semibold text-amber-400">
              {title}
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
          </div>
          {canDismiss && (
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
          {phase === 'available' && storeBlock && (
            <p className="text-xs leading-relaxed text-zinc-400">{unsupportedCopy(info)}</p>
          )}

          {phase === 'available' && !storeBlock && (
            <>
              <p className="text-xs leading-relaxed text-zinc-400">
                {unsupported
                  ? unsupportedCopy(info)
                  : force
                    ? 'This release must be installed before you can keep using Easy Candle.'
                    : 'A new release is ready to download. You can update now or keep using this version and install later when you quit.'}
              </p>
              {info?.releaseNotes ? <ReleaseNotes notes={info.releaseNotes} /> : null}
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
              {force
                ? 'The update downloaded successfully. Restart Easy Candle to install it.'
                : 'The update downloaded successfully. Restart Easy Candle to install it now, or continue working — it will install when you quit.'}
            </p>
          )}

          {phase === 'error' && (
            <p className="rounded border border-red-900/50 bg-red-950/40 px-2.5 py-2 text-xs text-red-300">
              {error || 'Unknown update error'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
          {phase === 'available' && storeBlock && (
            <button
              type="button"
              onClick={() => void onOpenStore()}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200 disabled:opacity-50"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open Microsoft Store
            </button>
          )}

          {phase === 'available' && !storeBlock && (
            <>
              {!force && (
                <button
                  type="button"
                  onClick={onLater}
                  disabled={busy}
                  className="inline-flex h-8 items-center rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-50"
                >
                  Later
                </button>
              )}
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
              {!force && (
                <button
                  type="button"
                  onClick={onLater}
                  disabled={busy}
                  className="inline-flex h-8 items-center rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-50"
                >
                  Later
                </button>
              )}
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

          {phase === 'error' && force && (
            <>
              {storeBlock && (
                <button
                  type="button"
                  onClick={() => void onOpenStore()}
                  disabled={busy}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Open Microsoft Store
                </button>
              )}
              <button
                type="button"
                onClick={() => void onRetry()}
                disabled={busy}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-amber-500/40 bg-amber-950/40 px-3 text-xs font-medium text-amber-300 hover:border-amber-400/70 hover:text-amber-200 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Retry
              </button>
            </>
          )}

          {phase === 'error' && !force && (
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
