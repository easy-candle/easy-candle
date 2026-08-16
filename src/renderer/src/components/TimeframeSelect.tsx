import { useMemo, useState } from 'react'
import { ChevronDown, Clock3, Star } from 'lucide-react'
import { TIMEFRAME_IDS, TIMEFRAMES } from '@shared/timeframes'
import Dropdown from '@/components/Dropdown'
import { useReplayStore } from '@/store/replayStore'

const FAVORITES_STORAGE_KEY = 'easy-candle:timeframe-favorites'

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((id): id is string => typeof id === 'string' && Boolean(TIMEFRAMES[id]))
  } catch {
    return []
  }
}

function persistFavorites(favorites: string[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites))
  } catch {
    // ignore quota / private mode
  }
}

export default function TimeframeSelect() {
  const timeframe = useReplayStore((s) => s.timeframe)
  const status = useReplayStore((s) => s.status)
  const dataSource = useReplayStore((s) => s.dataSource)
  const importMeta = useReplayStore((s) => s.importMeta)
  const replayLoading = useReplayStore((s) => s.replayLoading)
  const setTimeframe = useReplayStore((s) => s.setTimeframe)

  const [favorites, setFavorites] = useState<string[]>(loadFavorites)

  const imported = dataSource === 'imported'
  const disabled = status === 'loading' || replayLoading

  const availableIds = useMemo(
    () =>
      imported && importMeta?.timeframes
        ? TIMEFRAME_IDS.filter((id) => importMeta.timeframes[id] != null)
        : TIMEFRAME_IDS,
    [imported, importMeta]
  )

  const favoriteIds = availableIds.filter((id) => favorites.includes(id))
  const currentLabel = TIMEFRAMES[timeframe]?.label ?? timeframe

  function toggleFavorite(id: string): void {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      persistFavorites(next)
      return next
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <Dropdown
        align="start"
        menuClassName="w-40"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            disabled={disabled}
            onClick={toggle}
            aria-label="Timeframe"
            aria-expanded={open}
            className="flex h-8 items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900/80 px-2 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Clock3 className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
            <span className="sr-only">Timeframe</span>
            <span className="text-zinc-100">{currentLabel}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        )}
      >
        {availableIds.map((id) => {
          const isFavorite = favorites.includes(id)
          return (
            <div
              key={id}
              className={`group flex items-center ${
                id === timeframe ? 'bg-amber-950/40' : 'hover:bg-zinc-800/80'
              }`}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => setTimeframe(id)}
                className={`flex-1 px-3 py-2 text-left text-xs transition-colors ${
                  id === timeframe
                    ? 'text-amber-300'
                    : 'text-zinc-300 group-hover:text-zinc-100'
                }`}
              >
                {TIMEFRAMES[id].label}
              </button>
              <button
                type="button"
                aria-label={`${isFavorite ? 'Remove' : 'Add'} ${TIMEFRAMES[id].label} favorite`}
                aria-pressed={isFavorite}
                onClick={() => toggleFavorite(id)}
                className={`px-2.5 py-2 transition-colors ${
                  isFavorite ? 'text-amber-300' : 'text-zinc-500 group-hover:text-zinc-200'
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-current' : ''}`} aria-hidden />
              </button>
            </div>
          )
        })}
      </Dropdown>

      {favoriteIds.length > 0 && (
        <div className="flex h-8 items-center rounded border px-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 border-zinc-700 bg-zinc-900/80 gap-1">
          {favoriteIds.map((id) => (
            <button
              key={id}
              type="button"
              disabled={disabled}
              title={TIMEFRAMES[id].label}
              onClick={() => setTimeframe(id)}
              className={`inline-flex h-5 items-center rounded px-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                id === timeframe
                  ? 'bg-amber-950/40 text-amber-300'
                  : 'border-zinc-950/90 bg-zinc-950/90 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {TIMEFRAMES[id].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
