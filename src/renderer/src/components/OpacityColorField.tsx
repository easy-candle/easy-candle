import type { ReactNode } from 'react'
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
