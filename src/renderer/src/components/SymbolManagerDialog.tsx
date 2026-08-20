import { useEffect, useState, type ReactElement } from 'react'
import { ChevronDown, Eye, EyeOff, RotateCcw, X } from 'lucide-react'
import { SYMBOL_GROUPS } from '@shared/symbols'
import { useReplayStore } from '@/store/replayStore'
import { useSymbolVisibilityStore } from '@/store/symbolVisibilityStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

export default function SymbolManagerDialog(): ReactElement | null {
  const open = useUiLayoutStore((s) => s.symbolManagerDialogOpen)
  const setOpen = useUiLayoutStore((s) => s.setSymbolManagerDialogOpen)
  const importedList = useReplayStore((s) => s.importedList)
  const refreshImportedList = useReplayStore((s) => s.refreshImportedList)
  const hiddenGroups = useSymbolVisibilityStore((s) => s.hiddenGroups)
  const hiddenSymbols = useSymbolVisibilityStore((s) => s.hiddenSymbols)
  const hiddenImports = useSymbolVisibilityStore((s) => s.hiddenImports)
  const isGroupHidden = useSymbolVisibilityStore((s) => s.isGroupHidden)
  const isSymbolHidden = useSymbolVisibilityStore((s) => s.isSymbolHidden)
  const toggleGroup = useSymbolVisibilityStore((s) => s.toggleGroup)
  const toggleSymbol = useSymbolVisibilityStore((s) => s.toggleSymbol)
  const toggleImport = useSymbolVisibilityStore((s) => s.toggleImport)
  const reset = useSymbolVisibilityStore((s) => s.reset)

  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([])
  const [collapsedImported, setCollapsedImported] = useState(false)

  useEffect(() => {
    if (!open) return

    void refreshImportedList()

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen, refreshImportedList])

  if (!open) return null

  const totalSymbols = SYMBOL_GROUPS.reduce((acc, group) => acc + group.symbols.length, 0)
  const hiddenCount = hiddenGroups.length + hiddenSymbols.length + hiddenImports.length

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="symbol-manager-title"
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-md flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 id="symbol-manager-title" className="text-sm font-semibold text-amber-400">
              Symbol Manager
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              {totalSymbols} symbols · {hiddenCount} hidden
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={reset}
              disabled={
                hiddenGroups.length === 0 &&
                hiddenSymbols.length === 0 &&
                hiddenImports.length === 0
              }
              className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 px-2 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset
            </button>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {importedList.length > 0 && (
            <section className="mb-4">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-expanded={!collapsedImported}
                  onClick={() => setCollapsedImported((prev) => !prev)}
                  className="group flex min-w-0 items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                      collapsedImported ? '-rotate-90' : ''
                    }`}
                    aria-hidden
                  />
                  <span className="truncate">Imported</span>
                  <span className="font-normal normal-case text-zinc-600">
                    {importedList.filter((entry) => !hiddenImports.includes(entry.id)).length}/
                    {importedList.length}
                  </span>
                </button>
              </div>

              {!collapsedImported && (
                <div className="mt-1.5 space-y-0.5">
                  {importedList.map((entry) => {
                    const hidden = hiddenImports.includes(entry.id)
                    return (
                      <div
                        key={entry.id}
                        className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 pl-5 ${
                          hidden ? 'opacity-60' : ''
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2 text-xs text-zinc-300">
                          <span className="truncate font-medium">{entry.symbol}</span>
                        </span>
                        <button
                          type="button"
                          aria-pressed={!hidden}
                          aria-label={`${hidden ? 'Show' : 'Hide'} ${entry.symbol}`}
                          onClick={() => toggleImport(entry.id)}
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] transition-colors ${
                            hidden
                              ? 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
                              : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                          }`}
                        >
                          {hidden ? (
                            <EyeOff className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {SYMBOL_GROUPS.map((group) => {
            const groupHidden = isGroupHidden(group.key)
            const collapsed = collapsedGroups.includes(group.key)
            const visibleCount = group.symbols.filter(
              (symbol) => !groupHidden && !isSymbolHidden(symbol.binanceSymbol)
            ).length
            return (
              <section key={group.key} className="mb-4 last:mb-0">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-expanded={!collapsed}
                    onClick={() =>
                      setCollapsedGroups((prev) =>
                        prev.includes(group.key)
                          ? prev.filter((key) => key !== group.key)
                          : [...prev, group.key]
                      )
                    }
                    className="group flex min-w-0 items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                        collapsed ? '-rotate-90' : ''
                      }`}
                      aria-hidden
                    />
                    <span className="truncate">{group.label}</span>
                    <span className="font-normal normal-case text-zinc-600">
                      {visibleCount}/{group.symbols.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={!groupHidden}
                    onClick={() => toggleGroup(group.key)}
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                      groupHidden
                        ? 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                        : 'border-zinc-700 bg-zinc-800/60 text-zinc-200 hover:border-zinc-500'
                    }`}
                  >
                    {groupHidden ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" aria-hidden />
                        Hidden
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        Visible
                      </>
                    )}
                  </button>
                </div>

                {!collapsed && (
                  <div className="mt-1.5 space-y-0.5">
                    {group.symbols.map((symbol) => {
                      const hidden = groupHidden || isSymbolHidden(symbol.binanceSymbol)
                      return (
                        <div
                          key={symbol.id}
                          className={`flex items-center justify-between gap-2 rounded pl-5 pr-2 py-1.5 ${
                            hidden ? 'opacity-60' : ''
                          }`}
                        >
                          <span className="flex items-center gap-2 text-xs text-zinc-300">
                            <span className="font-medium">{symbol.label}</span>
                          </span>
                          <button
                            type="button"
                            aria-pressed={!hidden}
                            aria-label={`${hidden ? 'Show' : 'Hide'} ${symbol.label}`}
                            onClick={() => toggleSymbol(symbol.binanceSymbol)}
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] transition-colors ${
                              hidden
                                ? 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
                                : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                            }`}
                          >
                            {hidden ? (
                              <EyeOff className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        <div className="border-t border-zinc-800 px-4 py-2.5 text-[11px] text-zinc-500">
          Hidden groups, symbols, and imported datasets are excluded from the symbol picker.
        </div>
      </div>
    </div>
  )
}
