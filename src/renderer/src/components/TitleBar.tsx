import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import MenuBar from '@/components/MenuBar'
import iconUrl from '@/assets/easycandle-icon.svg'
import { api } from '@/lib/api'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void api.isWindowMaximized().then(setMaximized)
    return api.onWindowMaximizedChange(setMaximized)
  }, [])

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 select-none items-stretch border-b border-zinc-800 bg-zinc-950/90"
      onDoubleClick={() => api.toggleMaximizeWindow()}
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
        <span className="text-xs font-bold tracking-tight text-amber-400">Easy Candle</span>
      </div>

      <div className="flex items-stretch">
        <MenuBar />
      </div>

      <div className="ml-auto flex items-stretch">
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => api.minimizeWindow()}
          className="inline-flex h-full w-11 items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-zinc-100"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          onClick={() => api.toggleMaximizeWindow()}
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
          onClick={() => api.closeWindow()}
          className="inline-flex h-full w-11 items-center justify-center text-zinc-400 transition-colors hover:bg-red-600 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
