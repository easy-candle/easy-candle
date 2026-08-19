import { useEffect, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import iconUrl from '@/assets/easycandle-icon.svg'
import { contributors } from '@/data/contributors'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { APP_NAME } from '@shared/appName'

const REPO_URL = 'https://github.com/easy-candle/easy-candle'

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
        className="relative w-full max-w-[22rem] overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-amber-500/[0.08] to-transparent"
          aria-hidden
        />

        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="absolute right-2.5 top-2.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="relative pb-5 pl-6 pr-12 pt-6">
          <div className="flex items-center gap-3.5">
            <img
              src={iconUrl}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 rounded-xl border border-amber-500/20 shadow-sm shadow-amber-950/40"
              aria-hidden
            />
            <div className="min-w-0">
              <h2 id="about-title" className="text-[15px] font-semibold tracking-tight text-zinc-100">
                {APP_NAME}
              </h2>
              {version ? (
                <p className="mt-1">
                  <span className="inline-flex items-center rounded-full border border-zinc-700/80 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium tabular-nums text-zinc-400">
                    Version {version}
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          <p className="mt-4 text-[13px] leading-relaxed text-zinc-400">
            Replay charts and paper-trade without risk.
          </p>
        </div>

        <dl className="relative grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-2.5 border-t border-zinc-800/80 px-6 py-4 text-xs">
          <dt className="text-zinc-500">License</dt>
          <dd className="font-medium text-zinc-200">MIT</dd>
          <dt className="text-zinc-500">Source</dt>
          <dd>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-zinc-200 hover:text-amber-300"
            >
              GitHub
              <ExternalLink className="h-3 w-3 text-zinc-500" aria-hidden />
            </a>
          </dd>
        </dl>

        {contributors.length > 0 && (
          <div className="relative border-t border-zinc-800/80 px-6 py-4">
            <h3 className="text-[11px] font-medium text-zinc-500">Contributors</h3>
            <ul className="mt-3 flex flex-col gap-1">
              {contributors.map((contributor) => (
                <li key={contributor.login}>
                  <a
                    href={contributor.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 -mx-1.5 hover:bg-zinc-900"
                  >
                    <img
                      src={contributor.avatarSrc}
                      alt=""
                      width={28}
                      height={28}
                      className="h-7 w-7 rounded-full border border-zinc-700"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-200">
                      {contributor.login}
                    </span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-zinc-600" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
