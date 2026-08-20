import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Palette, Settings2, Trash2 } from 'lucide-react'
import FloatingPanel from '@/components/FloatingPanel'
import type { DrawingLineStyle, DrawingStyle, DrawingToolType } from '@/lib/chart/drawingGeometry'
import {
  DEFAULT_ZONE_COLORS,
  useDrawingSettingsStore,
  type DrawingPreset,
  type WidgetFieldSet
} from '@/store/drawingSettingsStore'
import type { PanelPos } from '@/store/uiLayoutStore'

const WIDTH_OPTIONS = [
  { value: 1, label: '1px' },
  { value: 2, label: '2px' },
  { value: 3, label: '3px' },
  { value: 4, label: '4px' }
]

const STYLE_OPTIONS = [
  { value: 0, label: 'Solid' },
  { value: 1, label: 'Dotted' },
  { value: 2, label: 'Dashed' },
  { value: 3, label: 'Large dashed' },
  { value: 4, label: 'Sparse dotted' }
]

const selectClass =
  'h-6 w-full min-w-0 rounded border border-zinc-700 bg-zinc-900 px-1 text-[11px] text-zinc-200 focus:border-amber-500/70 focus:outline-none'

function Field({
  label,
  children
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  )
}

function ColorField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (color: string) => void
}) {
  return (
    <Field label={label}>
      <label className="relative block h-6 w-full cursor-pointer overflow-hidden rounded border border-zinc-700">
        <span className="absolute inset-0" style={{ background: value }} />
        <input
          type="color"
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </Field>
  )
}

export default function DrawingStyleWidget({
  pos,
  onPosChange,
  style,
  fields,
  tool,
  showZoneColors = false,
  onStyleChange,
  onApplyPreset,
  onOpenSettings,
  onDelete
}: {
  pos: PanelPos | null
  onPosChange: (pos: PanelPos) => void
  style: DrawingStyle
  fields: WidgetFieldSet
  tool: DrawingToolType
  showZoneColors?: boolean
  onStyleChange: (patch: Partial<DrawingStyle>) => void
  onApplyPreset: (presetId: string) => void
  onOpenSettings: () => void
  onDelete: () => void
}) {
  const presets = useDrawingSettingsStore((s) => s.presets[tool])
  const [presetsOpen, setPresetsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!presetsOpen) return undefined
    function onPointerDown(event: PointerEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setPresetsOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [presetsOpen])

  const hasControls =
    fields.color ||
    fields.lineWidth ||
    fields.lineStyle ||
    (showZoneColors && (fields.tpColor || fields.slColor))

  return (
    <FloatingPanel
      title="Style"
      pos={pos}
      onPosChange={onPosChange}
      className="w-[300px]"
      headerActions={
        <>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Apply a preset"
              title="Presets"
              aria-expanded={presetsOpen}
              onClick={() => setPresetsOpen((open) => !open)}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-amber-300"
            >
              <Palette className="h-3.5 w-3.5" aria-hidden />
            </button>
            {presetsOpen && (
              <div className="absolute right-0 top-7 z-50 w-44 overflow-hidden rounded border border-zinc-700 bg-zinc-950 shadow-xl shadow-black/50">
                <div className="border-b border-zinc-800 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  Presets
                </div>
                {presets.length === 0 ? (
                  <p className="px-2 py-2 text-[11px] text-zinc-600">
                    No presets saved yet
                  </p>
                ) : (
                  <ul className="max-h-56 overflow-y-auto py-1">
                    {presets.map((preset: DrawingPreset) => (
                      <li key={preset.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onApplyPreset(preset.id)
                            setPresetsOpen(false)
                          }}
                          className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs text-zinc-200 hover:bg-zinc-800/80 hover:text-amber-200"
                        >
                          <span
                            className="h-3.5 w-3.5 shrink-0 rounded-sm border border-zinc-600"
                            style={{ background: preset.color }}
                          />
                          <span className="min-w-0 flex-1 truncate">{preset.name}</span>
                          <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                            {preset.lineWidth}px
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Open drawing settings"
            title="Drawing settings"
            onClick={onOpenSettings}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-amber-300"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Delete drawing"
            title="Delete drawing (Del)"
            onClick={onDelete}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-red-950/70 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </>
      }
    >
      <div className="flex items-end gap-1.5">
          {fields.color && (
            <ColorField
              label="Color"
              value={style.color}
              onChange={(color) => onStyleChange({ color })}
            />
          )}

          {showZoneColors && fields.tpColor && (
            <ColorField
              label="TP fill"
              value={style.tpColor ?? DEFAULT_ZONE_COLORS.tp}
              onChange={(color) => onStyleChange({ tpColor: color })}
            />
          )}

          {showZoneColors && fields.slColor && (
            <ColorField
              label="SL fill"
              value={style.slColor ?? DEFAULT_ZONE_COLORS.sl}
              onChange={(color) => onStyleChange({ slColor: color })}
            />
          )}

          {fields.lineWidth && (
            <Field label="Width">
              <select
                value={String(style.lineWidth)}
                aria-label="Line width"
                onChange={(event) => onStyleChange({ lineWidth: Number(event.target.value) })}
                className={selectClass}
              >
                {WIDTH_OPTIONS.map((option) => (
                  <option key={option.value} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {fields.lineStyle && (
            <Field label="Line">
              <select
                value={String(style.lineStyle)}
                aria-label="Line style"
                onChange={(event) =>
                  onStyleChange({ lineStyle: Number(event.target.value) as DrawingLineStyle })
                }
                className={selectClass}
              >
                {STYLE_OPTIONS.map((option) => (
                  <option key={option.value} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {!hasControls && (
            <span className="flex-1 pb-1 text-right text-[10px] text-zinc-600">
              All controls hidden
            </span>
          )}
        </div>
    </FloatingPanel>
  )
}