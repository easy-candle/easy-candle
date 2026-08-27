import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import iconUrl from '@/assets/easycandle-icon.svg'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { APP_NAME } from '@shared/appName'
import { getReleaseCodename, parseSemverMajor } from '@shared/releaseCodenames'

/** Same mascot set the splash uses, keyed by codename slug. */
const mascotUrls = import.meta.glob('../../assets/splash/codenames/*.png', {
  eager: true,
  import: 'default'
}) as Record<string, string>

export default function AboutDialog() {
  const open = useUiLayoutStore((s) => s.aboutDialogOpen)
  const setOpen = useUiLayoutStore((s) => s.setAboutDialogOpen)
  const [version, setVersion] = useState('')
  const generation = version ? parseSemverMajor(version) : undefined
  const codename = version ? getReleaseCodename(version) : undefined
  const mascotUrl = codename
    ? mascotUrls[`../../assets/splash/codenames/${codename}.png`]
    : undefined

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

        {codename && generation != null ? (
          <div className="relative flex items-end justify-between gap-4 border-t border-zinc-800/80 pl-6 pr-4 pt-4">
            <div
              className="pointer-events-none absolute bottom-0 right-0 h-24 w-48 bg-gradient-to-t from-amber-500/[0.07] to-transparent"
              aria-hidden
            />
            <p className="relative flex items-center gap-3 pb-5">
              <span className="text-[34px] font-bold leading-none tracking-tighter tabular-nums text-zinc-100">
                {generation}
              </span>
              <span className="flex flex-col gap-1.5 border-l border-zinc-800 pl-3">
                <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
                  Generation
                </span>
                <span className="text-[13px] font-bold uppercase leading-none tracking-[0.18em] text-amber-500">
                  {codename}
                </span>
              </span>
            </p>
            {mascotUrl ? (
              <img
                src={mascotUrl}
                alt={`${codename} mascot`}
                width={1024}
                height={1024}
                className="relative h-[104px] w-[104px] shrink-0 object-contain object-bottom"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
