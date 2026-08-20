import { useEffect, useRef, useState, type ReactNode } from 'react'
import { adoptRgb, parseColor, toColorString, toHex } from '@/lib/cssColor'

const CHECKERBOARD =
  'repeating-conic-gradient(#52525b 0% 25%, transparent 0% 50%) 50% / 8px 8px'

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-500">
      {children}
    </span>
  )
}

export function FillSwatch({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (color: string) => void
}) {
  const parsed = parseColor(value)
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5">
      <FieldLabel>{label}</FieldLabel>
      <label
        className="relative block h-6 w-full cursor-pointer overflow-hidden rounded border border-zinc-700"
        style={{ background: CHECKERBOARD }}
      >
        <span className="absolute inset-0" style={{ background: toColorString(parsed) }} />
        <input
          type="color"
          value={toHex(parsed)}
          aria-label={label}
          onChange={(event) => onChange(adoptRgb(event.target.value, value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </label>
  )
}

export function OpacitySlider({
  label = 'Opacity',
  value,
  onChange
}: {
  label?: string
  value: string
  onChange: (color: string) => void
}) {
  const parsed = parseColor(value)
  const alphaPercent = Math.round(parsed.a * 100)
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex h-6 items-center gap-1.5">
        <input
          type="range"
          min={0}
          max={100}
          value={alphaPercent}
          aria-label={label}
          onChange={(event) =>
            onChange(toColorString({ ...parsed, a: Number(event.target.value) / 100 }))
          }
          className="h-3 min-w-0 flex-1 cursor-pointer accent-amber-500"
        />
        <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-zinc-400">
          {alphaPercent}%
        </span>
      </div>
    </label>
  )
}

/**
 * Compact color swatch that opens a popup with the color picker and an opacity
 * slider. Clicking outside (or pressing Escape) closes the popup.
 */
export function ColorPickerPopup({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (color: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const parsed = parseColor(value)

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          aria-label={`Pick ${label}`}
          aria-expanded={open}
          title={label}
          onClick={() => setOpen((o) => !o)}
          className={`relative block h-6 w-full cursor-pointer overflow-hidden rounded border transition-colors ${
            open ? 'border-amber-500/70' : 'border-zinc-700 hover:border-zinc-500'
          }`}
          style={{ background: CHECKERBOARD }}
        >
          <span className="absolute inset-0" style={{ background: toColorString(parsed) }} />
        </button>
        {open && (
          <div className="absolute left-0 top-7 z-50 w-56 rounded border border-zinc-700 bg-zinc-950 p-2 shadow-xl shadow-black/50">
            <div className="flex items-center gap-2">
              <label className="relative block h-7 w-9 shrink-0 cursor-pointer overflow-hidden rounded border border-zinc-700">
                <span
                  className="absolute inset-0"
                  style={{ background: CHECKERBOARD }}
                />
                <span
                  className="absolute inset-0"
                  style={{ background: toColorString(parsed) }}
                />
                <input
                  type="color"
                  value={toHex(parsed)}
                  aria-label={label}
                  onChange={(event) => onChange(adoptRgb(event.target.value, value))}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <span className="min-w-0 flex-1 truncate text-[10px] tabular-nums text-zinc-400">
                {toHex(parsed)}
              </span>
            </div>
            <div className="mt-2">
              <OpacitySlider label="Opacity" value={value} onChange={onChange} />
            </div>
          </div>
        )}
      </div>
    </label>
  )
}
