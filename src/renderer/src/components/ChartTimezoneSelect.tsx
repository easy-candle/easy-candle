import { useMemo, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import {
  CHART_TIMEZONES,
  sessionTimezoneTitle,
  sessionUtcOffsetLabel,
  type ChartTimezone
} from '@/lib/chartTimezone'
import { useChartSettingsStore } from '@/store/chartSettingsStore'

function matchesQuery(zone: ChartTimezone, needle: string): boolean {
  return (
    zone.city.toLowerCase().includes(needle) ||
    zone.region.toLowerCase().includes(needle) ||
    zone.id.toLowerCase().includes(needle)
  )
}

function groupName(zone: ChartTimezone): string {
  return zone.region.split(' / ')[0] || 'UTC'
}

export default function ChartTimezoneSelect() {
  const timezone = useChartSettingsStore((s) => s.timezone)
  const setTimezone = useChartSettingsStore((s) => s.setTimezone)
  const [query, setQuery] = useState('')

  const offsetLabel = sessionUtcOffsetLabel(timezone)
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = needle
      ? CHART_TIMEZONES.filter((zone) => matchesQuery(zone, needle))
      : CHART_TIMEZONES
    const out: { name: string; zones: ChartTimezone[] }[] = []
    let current: { name: string; zones: ChartTimezone[] } | null = null
    for (const zone of matches) {
      const name = groupName(zone)
      if (!current || current.name !== name) {
        current = { name, zones: [] }
        out.push(current)
      }
      current.zones.push(zone)
    }
    return out
  }, [query])

  return (
    <Dropdown
      align="end"
      placement="top"
      menuClassName="w-72 py-0"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label="Chart timezone"
          aria-expanded={open}
          title={sessionTimezoneTitle(timezone)}
          className="inline-flex h-5 items-center gap-0.5 rounded bg-zinc-950/80 px-1.5 text-[10px] font-medium tabular-nums text-zinc-400 backdrop-blur-sm transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          {offsetLabel}
          <ChevronUp
            className={`h-2.5 w-2.5 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex flex-col">
          <div className="border-b border-zinc-800 p-1.5">
            <input
              type="search"
              value={query}
              placeholder="Search city or region"
              aria-label="Search timezone"
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              className="h-7 w-full rounded border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-amber-500/60"
            />
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {groups.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-zinc-500">No matching timezone</div>
            )}
            {groups.map((group) => (
              <div key={group.name}>
                <div className="sticky top-0 bg-zinc-950 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                  {group.name}
                </div>
                {group.zones.map((zone) => {
                  const selected = zone.id === timezone
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setTimezone(zone.id)
                        setQuery('')
                        close()
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors ${
                        selected
                          ? 'bg-amber-950/40 text-amber-300'
                          : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[11px]">{zone.city}</span>
                        {zone.region ? (
                          <span className="block truncate text-[10px] text-zinc-600">
                            {zone.region}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                        {sessionUtcOffsetLabel(zone.id)}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </Dropdown>
  )
}
