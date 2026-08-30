import { Check, Funnel, X } from 'lucide-react'
import Dropdown from '@/components/Dropdown'

export type FilterOption<T extends string> = {
  id: T
  label: string
  /** Secondary line, e.g. a UTC hour range. */
  hint?: string
  count: number
}

type MultiSelectFilterProps<T extends string> = {
  /** Heading above the options, and the accessible name of the trigger. */
  title: string
  /** Trigger text when nothing is selected. */
  allLabel: string
  /** Plural noun for the "N selected" summary, e.g. "sessions". */
  itemNoun: string
  options: readonly FilterOption<T>[]
  selected: T[]
  onChange: (next: T[]) => void
  menuClassName?: string
}

/**
 * Checkbox dropdown over a small fixed option set. An empty selection means "no
 * filter", so selecting every option reads the same as selecting none.
 */
export default function MultiSelectFilter<T extends string>({
  title,
  allLabel,
  itemNoun,
  options,
  selected,
  onChange,
  menuClassName = 'w-56'
}: MultiSelectFilterProps<T>) {
  const narrowed = selected.length > 0 && selected.length < options.length

  function summary(): string {
    if (!narrowed) return allLabel
    if (selected.length === 1) {
      return options.find((option) => option.id === selected[0])?.label ?? allLabel
    }
    return `${selected.length} ${itemNoun}`
  }

  function toggle(id: T): void {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id])
  }

  return (
    <Dropdown
      align="end"
      menuClassName={menuClassName}
      trigger={({ open, toggle: toggleOpen }) => (
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-label={title}
          className={`inline-flex h-7 items-center gap-1.5 rounded border px-2 text-[11px] font-medium transition-colors ${
            open || narrowed
              ? 'border-amber-500/70 bg-amber-950/40 text-amber-300'
              : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
          }`}
        >
          <Funnel className="h-3 w-3 shrink-0" aria-hidden />
          {summary()}
        </button>
      )}
    >
      {() => (
        <>
          <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            {title}
          </p>
          <div className="px-1 pb-1">
            {options.map((option) => {
              const checked = selected.includes(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  onClick={() => toggle(option.id)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-zinc-800/60"
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                      checked ? 'border-amber-500/70 bg-amber-950/60' : 'border-zinc-700'
                    }`}
                    aria-hidden
                  >
                    {checked && <Check className="h-2.5 w-2.5 text-amber-300" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-xs font-medium ${
                        checked ? 'text-zinc-100' : 'text-zinc-300'
                      }`}
                    >
                      {option.label}
                    </span>
                    {option.hint && (
                      <span className="block text-[10px] tabular-nums text-zinc-600">
                        {option.hint}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                    {option.count}
                  </span>
                </button>
              )
            })}
          </div>

          {selected.length > 0 && (
            <>
              <div className="h-px bg-zinc-800" />
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-zinc-400 transition-colors hover:bg-zinc-800/80 hover:text-zinc-200"
              >
                <X className="h-3 w-3 shrink-0" aria-hidden />
                Clear filter
              </button>
            </>
          )}
        </>
      )}
    </Dropdown>
  )
}
