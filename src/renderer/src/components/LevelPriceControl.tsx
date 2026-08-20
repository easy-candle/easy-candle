import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Crosshair } from 'lucide-react'
import { formatAssetPrice } from '@shared/pricePrecision'

export function parseLevelPrice(raw: string): number | null | undefined {
  const trimmed = String(raw).trim().replace(',', '.')
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

type LevelPriceControlProps = {
  label: string
  ariaLabel: string
  title: string
  value: number | null
  precision: number
  disabled?: boolean
  picking?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  onChange: (value: number | null) => void
  onPickClick?: () => void
}

export default function LevelPriceControl({
  label,
  ariaLabel,
  title,
  value,
  precision,
  disabled = false,
  picking = false,
  inputRef,
  onChange,
  onPickClick
}: LevelPriceControlProps) {
  const display = value != null ? formatAssetPrice(value, precision) : ''
  const [draft, setDraft] = useState(display)
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setDraft(display)
  }, [display])

  function commit(raw: string): void {
    const parsed = parseLevelPrice(raw)
    if (parsed === undefined) {
      setDraft(display)
      return
    }
    onChange(parsed)
    setDraft(parsed == null ? '' : formatAssetPrice(parsed, precision))
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
      return
    }
    if (event.key === 'Escape') {
      setDraft(display)
      if (picking) onPickClick?.()
      event.currentTarget.blur()
    }
  }

  return (
    <div
      className={`flex items-center gap-1 rounded border bg-zinc-900/60 px-1.5 py-0.5 ${
        picking ? 'border-amber-500/70' : 'border-zinc-800'
      }`}
      title={title}
    >
      <span className="px-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder="—"
        disabled={disabled}
        value={draft}
        onFocus={(event) => {
          focusedRef.current = true
          event.currentTarget.select()
        }}
        onBlur={(event) => {
          focusedRef.current = false
          commit(event.currentTarget.value)
        }}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        className="h-6 min-w-0 flex-1 bg-transparent text-center text-xs font-semibold tabular-nums text-zinc-200 outline-none placeholder:text-zinc-600 disabled:opacity-40"
      />
      {onPickClick && (
        <button
          type="button"
          aria-label={`Pick ${ariaLabel} from chart`}
          aria-pressed={picking}
          title="Pick price from chart"
          disabled={disabled}
          onClick={onPickClick}
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            picking
              ? 'bg-amber-950/60 text-amber-300'
              : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          <Crosshair className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
