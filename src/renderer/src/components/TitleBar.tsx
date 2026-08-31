import { memo, useEffect, useState, type CSSProperties } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import AccountMenu from '@/components/AccountMenu'
import GiveFeedback from '@/components/GiveFeedback'
import MenuBar from '@/components/MenuBar'
import iconUrl from '@/assets/easycandle-icon.svg'
import { APP_NAME } from '@shared/appName'
import { parseSemverMajor } from '@shared/releaseCodenames'

const MAJOR_VERSION = parseSemverMajor(__APP_VERSION__)

const DRAG_REGION = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG_REGION = { WebkitAppRegion: 'no-drag' } as CSSProperties

export default memo(function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.api.isWindowMaximized().then(setMaximized)
    return window.api.onWindowMaximizedChange(setMaximized)
  }, [])

  return (
    <div
      className="flex h-9 shrink-0 select-none items-stretch border-b border-zinc-800 bg-zinc-950/90"
      style={DRAG_REGION}
      onDoubleClick={() => window.api.toggleMaximizeWindow()}
    >
      <div className="flex items-center gap-2 px-2">
        <img
          src={iconUrl}
          alt=""
          width={22}
          height={22}
          className="h-[22px] w-[22px] rounded-sm"
          aria-hidden
        />
        <span className="text-xs font-bold tracking-tight text-amber-400">
          {APP_NAME}
          {MAJOR_VERSION != null ? (
            <span className="ml-1.5 font-semibold tabular-nums text-amber-400/70">
              {MAJOR_VERSION}
            </span>
          ) : null}
        </span>
      </div>

      <div className="flex items-stretch" style={NO_DRAG_REGION}>
        <MenuBar />
        <GiveFeedback />
      </div>

      <div className="ml-auto flex items-stretch" style={NO_DRAG_REGION}>
        <AccountMenu />
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => window.api.minimizeWindow()}
          className="inline-flex h-full w-11 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-zinc-100"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          onClick={() => window.api.toggleMaximizeWindow()}
          className="inline-flex h-full w-11 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-zinc-100"
        >
          {maximized ? (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Square className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={() => window.api.closeWindow()}
          className="inline-flex h-full w-11 items-center justify-center text-zinc-400 transition-colors hover:bg-red-600 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
})
