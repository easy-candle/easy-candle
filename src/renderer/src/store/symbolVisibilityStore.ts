import { create } from 'zustand'
import { SYMBOL_GROUPS } from '@shared/symbols'

const STORAGE_KEY = 'easy-candle:symbol-visibility'

type SymbolVisibilityState = {
  /** Group keys the user has hidden (e.g. "crypto"). */
  hiddenGroups: string[]
  /** Binance symbols the user has hidden (uppercase, e.g. "BTCUSDT"). */
  hiddenSymbols: string[]
  /** Imported dataset ids the user has hidden (dynamic, e.g. "import_1699..."). */
  hiddenImports: string[]
  /** Group keys currently collapsed in the symbol picker. */
  collapsedGroups: string[]
  isGroupHidden: (key: string) => boolean
  isSymbolHidden: (symbol: string) => boolean
  isImportHidden: (id: string) => boolean
  isGroupCollapsed: (key: string) => boolean
  toggleGroup: (key: string) => void
  toggleSymbol: (symbol: string) => void
  toggleImport: (id: string) => void
  toggleGroupCollapsed: (key: string) => void
  reset: () => void
}

const KNOWN_GROUP_KEYS = new Set(SYMBOL_GROUPS.map((group) => group.key))
const KNOWN_SYMBOL_KEYS = new Set(
  SYMBOL_GROUPS.flatMap((group) =>
    group.symbols.map((symbol) => symbol.binanceSymbol.toUpperCase())
  )
)

function sanitizeKeys(raw: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((key): key is string => typeof key === 'string' && allowed.has(key))
}

function sanitizeImportIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((key): key is string => typeof key === 'string')
}

function defaultCollapsedGroups(): string[] {
  return SYMBOL_GROUPS.filter((group) => group.collapsed).map((group) => group.key)
}

function loadPersisted(): {
  hiddenGroups: string[]
  hiddenSymbols: string[]
  hiddenImports: string[]
  collapsedGroups: string[]
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw)
      return {
        hiddenGroups: [],
        hiddenSymbols: [],
        hiddenImports: [],
        collapsedGroups: defaultCollapsedGroups()
      }
    const parsed = JSON.parse(raw) as {
      hiddenGroups?: unknown
      hiddenSymbols?: unknown
      hiddenImports?: unknown
      collapsedGroups?: unknown
    }
    return {
      hiddenGroups: sanitizeKeys(parsed?.hiddenGroups, KNOWN_GROUP_KEYS),
      hiddenSymbols: sanitizeKeys(parsed?.hiddenSymbols, KNOWN_SYMBOL_KEYS),
      hiddenImports: sanitizeImportIds(parsed?.hiddenImports),
      collapsedGroups: sanitizeKeys(parsed?.collapsedGroups, KNOWN_GROUP_KEYS)
    }
  } catch {
    return {
      hiddenGroups: [],
      hiddenSymbols: [],
      hiddenImports: [],
      collapsedGroups: defaultCollapsedGroups()
    }
  }
}

function persist(
  hiddenGroups: string[],
  hiddenSymbols: string[],
  hiddenImports: string[],
  collapsedGroups: string[]
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ hiddenGroups, hiddenSymbols, hiddenImports, collapsedGroups })
    )
  } catch {
    // ignore quota / private mode
  }
}

const initial = loadPersisted()

export const useSymbolVisibilityStore = create<SymbolVisibilityState>((set, get) => ({
  hiddenGroups: initial.hiddenGroups,
  hiddenSymbols: initial.hiddenSymbols,
  hiddenImports: initial.hiddenImports,
  collapsedGroups: initial.collapsedGroups,

  isGroupHidden: (key) => get().hiddenGroups.includes(key),

  isSymbolHidden: (symbol) => get().hiddenSymbols.includes(String(symbol || '').toUpperCase()),

  isImportHidden: (id) => get().hiddenImports.includes(id),

  isGroupCollapsed: (key) => get().collapsedGroups.includes(key),

  toggleGroup: (key) => {
    const currentlyHidden = get().hiddenGroups.includes(key)

    const hiddenGroups = currentlyHidden
      ? get().hiddenGroups.filter((entry) => entry !== key)
      : [...get().hiddenGroups, key]

    set({ hiddenGroups })
    persist(hiddenGroups, get().hiddenSymbols, get().hiddenImports, get().collapsedGroups)
  },

  toggleSymbol: (symbol) => {
    const key = String(symbol || '').toUpperCase()
    if (!key) return
    const currentlyHidden = get().hiddenSymbols.includes(key)

    const hiddenSymbols = currentlyHidden
      ? get().hiddenSymbols.filter((entry) => entry !== key)
      : [...get().hiddenSymbols, key]

    set({ hiddenSymbols })
    persist(get().hiddenGroups, hiddenSymbols, get().hiddenImports, get().collapsedGroups)
  },

  toggleImport: (id) => {
    if (!id) return
    const currentlyHidden = get().hiddenImports.includes(id)

    const hiddenImports = currentlyHidden
      ? get().hiddenImports.filter((entry) => entry !== id)
      : [...get().hiddenImports, id]

    set({ hiddenImports })
    persist(get().hiddenGroups, get().hiddenSymbols, hiddenImports, get().collapsedGroups)
  },

  toggleGroupCollapsed: (key) => {
    const currentlyCollapsed = get().collapsedGroups.includes(key)

    const collapsedGroups = currentlyCollapsed
      ? get().collapsedGroups.filter((entry) => entry !== key)
      : [...get().collapsedGroups, key]

    set({ collapsedGroups })
    persist(get().hiddenGroups, get().hiddenSymbols, get().hiddenImports, collapsedGroups)
  },

  reset: () => {
    set({
      hiddenGroups: [],
      hiddenSymbols: [],
      hiddenImports: [],
      collapsedGroups: defaultCollapsedGroups()
    })
    persist([], [], [], defaultCollapsedGroups())
  }
}))
