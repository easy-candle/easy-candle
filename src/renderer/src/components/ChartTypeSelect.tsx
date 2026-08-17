import { useState } from 'react'
import { ChartBar, ChartCandlestick, ChartLine, Check, ChevronDown, Star } from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import { CHART_TYPES, type ChartType } from '@/lib/chart/chartTypes'
import { useReplayStore } from '@/store/replayStore'
import Tooltip from '@/components/Tooltip'

const FAVORITES_STORAGE_KEY = 'easy-candle:charttype-favorites'

const ICONS: Record<ChartType, typeof ChartCandlestick> = {
  candlestick: ChartCandlestick,
  heikinashi: ChartCandlestick,
  line: ChartLine,
  bar: ChartBar
}

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (id): id is string => typeof id === 'string' && CHART_TYPES.some((entry) => entry.id === id)
    )
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

export default function ChartTypeSelect() {
  const chartType = useReplayStore((s) => s.chartType)
  const setChartType = useReplayStore((s) => s.setChartType)
  const currentLabel = CHART_TYPES.find((entry) => entry.id === chartType)?.label ?? 'Chart'

  const [favorites, setFavorites] = useState<string[]>(loadFavorites)

  const favoriteIds = CHART_TYPES.map((entry) => entry.id).filter((id) => favorites.includes(id))

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
        menuClassName="w-44"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label="Chart type"
            aria-expanded={open}
            className={`inline-flex h-8 items-center gap-1.5 rounded border px-2 text-xs font-medium transition-colors ${
              open
                ? 'border-amber-500/70 bg-amber-950/40 text-amber-300'
                : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
            }`}
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center">
              {(() => {
                const Icon = ICONS[chartType]
                return <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              })()}
            </span>
            <span>{currentLabel}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        )}
      >
        {CHART_TYPES.map((entry) => {
          const active = entry.id === chartType
          const isFavorite = favorites.includes(entry.id)
          return (
            <div
              key={entry.id}
              className={`group flex items-center ${
                active ? 'bg-amber-950/10 dark:bg-amber-950/40' : 'hover:bg-zinc-800/80'
              }`}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => setChartType(entry.id)}
                className={`flex flex-1 items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  active ? 'text-amber-300' : 'text-zinc-300 group-hover:text-zinc-100'
                }`}
              >
                <span className="flex w-4 shrink-0 items-center justify-center">
                  {active && <Check className="h-3.5 w-3.5" aria-hidden />}
                </span>
                {(() => {
                  const Icon = ICONS[entry.id]
                  return <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                })()}
                <span className="flex-1 font-medium">{entry.label}</span>
              </button>
              <button
                type="button"
                aria-label={`${isFavorite ? 'Remove' : 'Add'} ${entry.label} favorite`}
                aria-pressed={isFavorite}
                onClick={() => toggleFavorite(entry.id)}
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
          {favoriteIds.map((id) => {
            const label = CHART_TYPES.find((entry) => entry.id === id)?.label ?? id
            const Icon = ICONS[id]
            return (
              <Tooltip text={label} side="bottom" key={id}>
                <button
                  type="button"
                  onClick={() => setChartType(id)}
                  aria-label={label}
                  className={`inline-flex h-5 w-6 items-center justify-center rounded px-1 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    id === chartType
                      ? 'bg-amber-950/10 dark:bg-amber-950/40 text-amber-300'
                      : 'border-zinc-950/90 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </button>
              </Tooltip>
            )
          })}
        </div>
      )}
    </div>
  )
}
