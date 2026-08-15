import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import iconUrl from '@/assets/easycandle-icon.svg'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

export default function AboutDialog() {
  const open = useUiLayoutStore((s) => s.aboutDialogOpen)
  const setOpen = useUiLayoutStore((s) => s.setAboutDialogOpen)
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (!open) return

    void window.api.getAppVersion().then(setVersion)

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="w-full max-w-sm overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <h2 id="about-title" className="text-sm font-semibold text-amber-400">
            About
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="px-4 py-5 text-center">
          <img
            src={iconUrl}
            alt=""
            width={56}
            height={56}
            className="mx-auto h-14 w-14 rounded-lg border border-amber-500/30"
            aria-hidden
          />
          <h3 className="mt-3 text-base font-semibold text-zinc-100">Easy Candle</h3>
          {version && <p className="mt-0.5 text-xs text-zinc-500">Version {version}</p>}
          <p className="mt-3 text-xs leading-relaxed text-zinc-400">
            Binance candle replay desktop app for practicing paper trading.
          </p>

          <div className="mt-4 space-y-1 text-[11px] text-zinc-500">
            <p>
              License <span className="text-zinc-300">MIT</span>
            </p>
            <p>
              Repository{' '}
              <a
                href="https://github.com/easy-candle/easy-candle"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400/90 hover:text-sky-300"
              >
                github.com/easy-candle/easy-candle
              </a>
            </p>
          </div>

          <p className="mt-4 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            Credits · Easy Candle contributors
          </p>
        </div>
      </div>
    </div>
  )
}
