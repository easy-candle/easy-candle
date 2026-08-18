import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Crosshair, Palette, RotateCcw, SlidersHorizontal, Timer, X } from 'lucide-react'
import {
  resolveChartPalette,
  useChartSettingsStore,
  type ColorOverrides
} from '@/store/chartSettingsStore'
import { useThemeStore } from '@/store/themeStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { CrosshairMode, LineStyle, PriceScaleMode } from 'lightweight-charts'

const CROSSHAIR_MODES = [
  { value: CrosshairMode.Normal, label: 'Normal' },
  { value: CrosshairMode.Magnet, label: 'Magnet' },
  { value: CrosshairMode.Hidden, label: 'Hidden' }
]

const LINE_STYLES = [
  { value: LineStyle.Solid, label: 'Solid' },
  { value: LineStyle.Dotted, label: 'Dotted' },
  { value: LineStyle.Dashed, label: 'Dashed' },
  { value: LineStyle.LargeDashed, label: 'Large dashed' },
  { value: LineStyle.SparseDotted, label: 'Sparse dotted' }
]

const PRICE_SCALE_MODES = [
  { value: PriceScaleMode.Normal, label: 'Normal' },
  { value: PriceScaleMode.Logarithmic, label: 'Logarithmic' },
  { value: PriceScaleMode.Percentage, label: 'Percentage' },
  { value: PriceScaleMode.IndexedTo100, label: 'Indexed to 100' }
]

function Section({
  icon: Icon,
  title,
  children
}: {
  icon: typeof Palette
  title: string
  children: ReactNode
}): ReactElement {
  return (
    <section className="border-b border-zinc-800/80 px-4 py-3">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {title}
      </h3>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

type Rgba = { r: number; g: number; b: number; a: number }

const CHECKERBOARD = 'repeating-conic-gradient(#52525b 0% 25%, transparent 0% 50%) 50% / 8px 8px'

function parseColor(value: string): Rgba {
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value)
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] ? Math.min(1, Math.max(0, Number(rgba[4]))) : 1
    }
  }
  let hex = value.replace('#', '')
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (hex.length === 8) {
    const alpha = parseInt(hex.slice(6, 8), 16) / 255
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: alpha
    }
  }
  return {
    r: parseInt(hex.slice(0, 2), 16) || 0,
    g: parseInt(hex.slice(2, 4), 16) || 0,
    b: parseInt(hex.slice(4, 6), 16) || 0,
    a: 1
  }
}

function toColorString({ r, g, b, a }: Rgba): string {
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  const alpha = Math.round(a * 100) / 100
  return alpha >= 1 ? hex : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function ColorField({
  label,
  value,
  onChange,
  open,
  onOpenChange
}: {
  label: string
  value: string
  onChange: (color: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const { r, g, b, a } = parseColor(value || '#000000')
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  const alphaPercent = Math.round(a * 100)

  function togglePopup(): void {
    if (open) {
      setPos(null)
      onOpenChange(false)
      return
    }
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const POPUP_WIDTH = 240
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPUP_WIDTH - 8))
    setPos({ top: rect.bottom + 4, left })
    onOpenChange(true)
  }

  useEffect(() => {
    if (!open) return undefined

    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popupRef.current?.contains(target)) return
      onOpenChange(false)
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onOpenChange(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  return (
    <div className="min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={togglePopup}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded px-1 py-1 transition-colors ${
          open ? 'bg-zinc-900 ring-1 ring-amber-500/50' : 'hover:bg-zinc-900'
        }`}
      >
        <span
          className="relative h-5 w-7 shrink-0 overflow-hidden rounded border border-zinc-700"
          style={{ background: CHECKERBOARD }}
        >
          <span
            className="absolute inset-0"
            style={{ background: `rgba(${r}, ${g}, ${b}, ${a})` }}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-xs text-zinc-300">{label}</span>
        <span className="shrink-0 text-[9px] tabular-nums text-zinc-500">{alphaPercent}%</span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label={`${label} color`}
            className="fixed z-[70] w-60 rounded border border-zinc-700 bg-zinc-950 p-3 shadow-2xl shadow-black/60"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                {label}
              </span>
              <button
                type="button"
                aria-label="Close color picker"
                onClick={() => onOpenChange(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>

            <label
              className="relative mt-2 block h-20 w-full cursor-pointer overflow-hidden rounded border border-zinc-700"
              style={{ background: CHECKERBOARD }}
            >
              <span
                className="absolute inset-0"
                style={{ background: `rgba(${r}, ${g}, ${b}, ${a})` }}
              />
              <input
                type="color"
                value={hex}
                onChange={(event) =>
                  onChange(toColorString({ ...parseColor(event.target.value), a }))
                }
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label={`${label} color picker`}
              />
            </label>

            <div className="mt-3 flex items-center gap-2">
              <span className="shrink-0 text-[10px] text-zinc-500">Opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                value={alphaPercent}
                onChange={(event) =>
                  onChange(toColorString({ r, g, b, a: Number(event.target.value) / 100 }))
                }
                className="h-3 min-w-0 flex-1 cursor-pointer accent-amber-500"
                aria-label={`${label} opacity`}
              />
              <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-zinc-400">
                {alphaPercent}%
              </span>
            </div>

            <code className="mt-2 block text-[10px] text-zinc-500">
              {toColorString({ r, g, b, a })}
            </code>
          </div>,
          document.body
        )}
    </div>
  )
}

function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}): ReactElement {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-xs text-zinc-300">{label}</span>
      <select
        value={String(value)}
        onChange={(event) => {
          const match = options.find((option) => String(option.value) === event.target.value)
          if (match) onChange(match.value)
        }}
        className="h-7 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs text-zinc-200 focus:border-amber-500/70 focus:outline-none"
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ToggleField({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}): ReactElement {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-xs text-zinc-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-amber-500/80' : 'bg-zinc-700'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full shadow transition-all ${
            checked ? 'translate-x-4 bg-white' : 'translate-x-0 bg-zinc-400'
          }`}
        />
      </button>
    </label>
  )
}

export default function ChartSettingsDialog(): ReactElement | null {
  const open = useUiLayoutStore((s) => s.chartSettingsDialogOpen)
  const setOpen = useUiLayoutStore((s) => s.setChartSettingsDialogOpen)
  const theme = useThemeStore((s) => s.theme)
  const colors = useChartSettingsStore((s) => s.colors)
  const crosshair = useChartSettingsStore((s) => s.crosshair)
  const priceScale = useChartSettingsStore((s) => s.priceScale)
  const timeScale = useChartSettingsStore((s) => s.timeScale)
  const setColors = useChartSettingsStore((s) => s.setColors)
  const setCrosshair = useChartSettingsStore((s) => s.setCrosshair)
  const setPriceScale = useChartSettingsStore((s) => s.setPriceScale)
  const setTimeScale = useChartSettingsStore((s) => s.setTimeScale)
  const resetAll = useChartSettingsStore((s) => s.resetAll)

  const palette = resolveChartPalette(theme, colors)
  const [openColorKey, setOpenColorKey] = useState<string | null>(null)

  function closeDialog(): void {
    setOpenColorKey(null)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return

    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      if (openColorKey != null) {
        setOpenColorKey(null)
        return
      }
      setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen, openColorKey])

  if (!open) return null

  const colorField = (key: keyof ColorOverrides, label: string): ReactElement => (
    <ColorField
      label={label}
      value={palette[key] ?? ''}
      onChange={(value) => setColors({ [key]: value })}
      open={openColorKey === key}
      onOpenChange={(isOpen) => setOpenColorKey(isOpen ? key : null)}
    />
  )

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={closeDialog}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-settings-title"
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-lg flex-col overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <h2 id="chart-settings-title" className="text-sm font-semibold text-amber-400">
            Chart Settings
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={closeDialog}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section icon={Palette} title="Colors">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
              {colorField('upColor', 'Up candle')}
              {colorField('downColor', 'Down candle')}
              {colorField('borderUpColor', 'Up border')}
              {colorField('borderDownColor', 'Down border')}
              {colorField('wickUpColor', 'Up wick')}
              {colorField('wickDownColor', 'Down wick')}
              {colorField('lineColor', 'Line')}
              {colorField('crosshairColor', 'Crosshair')}
              {colorField('background', 'Background')}
              {colorField('text', 'Text')}
              {colorField('grid', 'Grid')}
              {colorField('scaleBorder', 'Scale border')}
              {colorField('watermark', 'Watermark')}
            </div>
          </Section>

          <Section icon={Crosshair} title="Crosshair">
            <div className="flex flex-col gap-2.5">
              <SelectField
                label="Mode"
                value={crosshair.mode}
                options={CROSSHAIR_MODES}
                onChange={(mode) => setCrosshair({ mode })}
              />
              <SelectField
                label="Line style"
                value={crosshair.lineStyle}
                options={LINE_STYLES}
                onChange={(lineStyle) => setCrosshair({ lineStyle })}
              />
              <ToggleField
                label="Show crosshair"
                checked={crosshair.visible}
                onChange={(visible) => setCrosshair({ visible })}
              />
              <ToggleField
                label="Show labels"
                checked={crosshair.labelVisible}
                onChange={(labelVisible) => setCrosshair({ labelVisible })}
              />
            </div>
          </Section>

          <Section icon={SlidersHorizontal} title="Price scale">
            <div className="flex flex-col gap-2.5">
              <SelectField
                label="Mode"
                value={priceScale.mode}
                options={PRICE_SCALE_MODES}
                onChange={(mode) => setPriceScale({ mode })}
              />
              <ToggleField
                label="Invert scale"
                checked={priceScale.invertScale}
                onChange={(invertScale) => setPriceScale({ invertScale })}
              />
              <ToggleField
                label="Auto scale"
                checked={priceScale.autoScale}
                onChange={(autoScale) => setPriceScale({ autoScale })}
              />
            </div>
          </Section>

          <Section icon={Timer} title="Time scale">
            <div className="flex flex-col gap-2.5">
              <ToggleField
                label="Show time labels"
                checked={timeScale.timeVisible}
                onChange={(timeVisible) => setTimeScale({ timeVisible })}
              />
              <ToggleField
                label="Show seconds"
                checked={timeScale.secondsVisible}
                onChange={(secondsVisible) => setTimeScale({ secondsVisible })}
              />
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3">
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-700 px-2.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset defaults
          </button>
          <span className="text-[10px] text-zinc-600">Settings apply to both panes.</span>
        </div>
      </div>
    </div>
  )
}
