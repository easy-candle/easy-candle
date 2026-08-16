import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

type Shortcut = { keys: string[]; description: string }

const SHORTCUTS: Shortcut[] = [
  { keys: ['Space'], description: 'Play / pause replay' },
  { keys: ['ArrowRight'], description: 'Step forward one candle' },
  { keys: ['ArrowLeft'], description: 'Step backward one candle' },
  { keys: ['Tab'], description: 'Toggle next-candle pane (split view)' },
  { keys: ['Escape'], description: 'Cancel drawing / return to select tool' },
  { keys: ['Delete', 'Backspace'], description: 'Delete selected drawing' },
  { keys: ['Ctrl+Drag'], description: 'Duplicate drawing' },
  { keys: ['F'], description: 'Toggle chart fullscreen' }
]

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-sm border border-zinc-600/50 bg-zinc-800 px-1.5 text-[10px] font-medium uppercase leading-none text-zinc-200">
      {children}
    </kbd>
  )
}

export default function KeyboardShortcutsDialog() {
  const open = useUiLayoutStore((s) => s.shortcutsDialogOpen)
  const setOpen = useUiLayoutStore((s) => s.setShortcutsDialogOpen)

  useEffect(() => {
    if (!open) return

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
        aria-labelledby="shortcuts-title"
        className="w-full max-w-md overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <h2 id="shortcuts-title" className="text-sm font-semibold text-amber-400">
            Keyboard Shortcuts
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

        <ul className="divide-y divide-zinc-800/80 px-4 py-2">
          {SHORTCUTS.map((shortcut) => (
            <li
              key={shortcut.description}
              className="flex items-center justify-between gap-4 py-2.5"
            >
              <span className="text-xs text-zinc-300">{shortcut.description}</span>
              <span className="flex shrink-0 items-center gap-1">
                {shortcut.keys.map((key, index) => (
                  <span key={key} className="flex items-center gap-1">
                    {index > 0 && <span className="text-zinc-600">/</span>}
                    <Kbd>{key}</Kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
