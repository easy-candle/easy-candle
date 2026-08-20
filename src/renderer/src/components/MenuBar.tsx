import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronRight } from 'lucide-react'
import { useReplayStore } from '@/store/replayStore'
import { useThemeStore } from '@/store/themeStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

type MenuEntry =
  | {
      type: 'item'
      label: string
      shortcut?: string
      checked?: boolean
      disabled?: boolean
      title?: string
      onSelect: () => void
    }
  | { type: 'submenu'; label: string; children: MenuEntry[] }
  | { type: 'separator' }

type MenuGroup = { label: string; entries: MenuEntry[] }

function MenuEntryView({ entry, onClose }: { entry: MenuEntry; onClose: () => void }): ReactNode {
  const [subOpen, setSubOpen] = useState(false)

  if (entry.type === 'separator') {
    return <div className="my-1 h-px bg-zinc-800" />
  }

  if (entry.type === 'submenu') {
    return (
      <div
        className="relative"
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <div
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <span className="w-4 shrink-0" />
          <span className="flex-1">{entry.label}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        </div>
        {subOpen && (
          <div
            role="menu"
            className="absolute left-full top-0 min-w-[13rem] rounded border border-zinc-700 bg-zinc-950 py-1 shadow-xl shadow-black/50"
          >
            {entry.children.map((child, index) => (
              <MenuEntryView key={index} entry={child} onClose={onClose} />
            ))}
          </div>
        )}
      </div>
    )
  }

  const checkable = entry.checked !== undefined

  return (
    <button
      type="button"
      role={checkable ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={checkable ? entry.checked : undefined}
      disabled={entry.disabled}
      title={entry.title}
      onClick={() => {
        entry.onSelect()
        onClose()
      }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex w-4 shrink-0 items-center justify-center">
        {checkable && entry.checked && <Check className="h-3.5 w-3.5 text-amber-300" aria-hidden />}
      </span>
      <span className="flex-1">{entry.label}</span>
      {entry.shortcut && (
        <span className="ml-4 shrink-0 text-[10px] text-zinc-500">{entry.shortcut}</span>
      )}
    </button>
  )
}

export default function MenuBar() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | null>(null)

  const chartFullscreen = useUiLayoutStore((s) => s.chartFullscreen)
  const toggleChartFullscreen = useUiLayoutStore((s) => s.toggleChartFullscreen)
  const showMainToolbar = useUiLayoutStore((s) => s.showMainToolbar)
  const showStatusBar = useUiLayoutStore((s) => s.showStatusBar)
  const showDrawingToolbar = useUiLayoutStore((s) => s.showDrawingToolbar)
  const showReplayControls = useUiLayoutStore((s) => s.showReplayControls)
  const showPaperTrade = useUiLayoutStore((s) => s.showPaperTrade)
  const toggleMainToolbar = useUiLayoutStore((s) => s.toggleMainToolbar)
  const toggleStatusBar = useUiLayoutStore((s) => s.toggleStatusBar)
  const toggleDrawingToolbar = useUiLayoutStore((s) => s.toggleDrawingToolbar)
  const toggleReplayControls = useUiLayoutStore((s) => s.toggleReplayControls)
  const togglePaperTrade = useUiLayoutStore((s) => s.togglePaperTrade)
  const setShortcutsDialogOpen = useUiLayoutStore((s) => s.setShortcutsDialogOpen)
  const setAboutDialogOpen = useUiLayoutStore((s) => s.setAboutDialogOpen)
  const startTour = useUiLayoutStore((s) => s.startTour)
  const inReplay = useReplayStore((s) => s.mode === 'replay')
  const setImportDataDialogOpen = useUiLayoutStore((s) => s.setImportDataDialogOpen)
  const setChartSettingsDialogOpen = useUiLayoutStore((s) => s.setChartSettingsDialogOpen)
  const setSymbolManagerDialogOpen = useUiLayoutStore((s) => s.setSymbolManagerDialogOpen)
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  const groups: MenuGroup[] = [
    {
      label: 'View',
      entries: [
        {
          type: 'item',
          label: 'Paper Trade',
          checked: showPaperTrade,
          onSelect: togglePaperTrade
        },
        {
          type: 'submenu',
          label: 'Toolbars',
          children: [
            {
              type: 'item',
              label: 'Main Toolbar',
              checked: showMainToolbar,
              onSelect: toggleMainToolbar
            },
            {
              type: 'item',
              label: 'Status Bar',
              checked: showStatusBar,
              onSelect: toggleStatusBar
            },
            {
              type: 'item',
              label: 'Drawing Toolbar',
              checked: showDrawingToolbar,
              onSelect: toggleDrawingToolbar
            },
            {
              type: 'item',
              label: 'Replay Controls',
              checked: showReplayControls,
              onSelect: toggleReplayControls
            }
          ]
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Fullscreen',
          shortcut: 'F',
          checked: chartFullscreen,
          onSelect: toggleChartFullscreen
        },
        {
          type: 'item',
          label: 'Light theme',
          checked: theme === 'light',
          onSelect: () => setTheme(theme === 'light' ? 'dark' : 'light')
        }
      ]
    },
    {
      label: 'Chart',
      entries: [
        {
          type: 'item',
          label: 'Import Data',
          onSelect: () => setImportDataDialogOpen(true)
        },
        {
          type: 'item',
          label: 'Settings',
          onSelect: () => setChartSettingsDialogOpen(true)
        },
        {
          type: 'item',
          label: 'Symbol Manager',
          onSelect: () => setSymbolManagerDialogOpen(true)
        }
      ]
    },
    {
      label: 'Help',
      entries: [
        {
          type: 'item',
          label: 'Take a tour',
          disabled: inReplay,
          title: inReplay ? 'Exit replay to take the tour' : undefined,
          onSelect: startTour
        },
        {
          type: 'item',
          label: 'Keyboard Shortcuts',
          onSelect: () => setShortcutsDialogOpen(true)
        },
        {
          type: 'item',
          label: 'About',
          onSelect: () => setAboutDialogOpen(true)
        },
        { type: 'separator' },
        {
          type: 'item',
          label: 'Check for Update',
          onSelect: () => {
            void checkForUpdates()
          }
        }
      ]
    }
  ]

  function showNotice(message: string): void {
    setNotice(message)
    if (noticeTimer.current != null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000)
  }

  async function checkForUpdates(): Promise<void> {
    try {
      const result = await window.api.checkForUpdates()
      if (!result.ok) {
        showNotice(result.error || 'Update check failed')
      } else if (result.skipped) {
        showNotice('Updates are disabled in this build')
      } else if (result.version) {
        showNotice(`Update available: v${result.version}`)
      } else {
        showNotice('You are up to date')
      }
    } catch {
      showNotice('Update check failed')
    }
  }

  useEffect(() => {
    if (openIndex === null) return

    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpenIndex(null)
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpenIndex(null)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openIndex])

  useEffect(() => {
    return () => {
      if (noticeTimer.current != null) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  return (
    <div ref={rootRef} className="flex h-full items-stretch">
      {groups.map((group, index) => {
        const open = openIndex === index
        return (
          <div key={group.label} className="relative">
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : index)}
              onMouseEnter={() => {
                if (openIndex !== null) setOpenIndex(index)
              }}
              className={`h-full px-2.5 text-xs transition-colors ${
                open
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100'
              }`}
            >
              {group.label}
            </button>
            {open && (
              <div
                role="menu"
                className="absolute left-0 top-full z-50 min-w-[13rem] rounded border border-zinc-700 bg-zinc-950 py-1 shadow-xl shadow-black/10"
              >
                {group.entries.map((entry, entryIndex) => (
                  <MenuEntryView
                    key={entryIndex}
                    entry={entry}
                    onClose={() => setOpenIndex(null)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {notice &&
        createPortal(
          <div className="pointer-events-none fixed bottom-4 right-4 z-[70] rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 shadow-xl shadow-black/50">
            {notice}
          </div>,
          document.body
        )}
    </div>
  )
}
