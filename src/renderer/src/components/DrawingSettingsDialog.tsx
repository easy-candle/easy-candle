import { useEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { Check, Trash2, Undo2, X } from 'lucide-react'
import { LineStyle } from 'lightweight-charts'
import type {
  DrawingLineStyle,
  DrawingStyle,
  FibLevelConfig
} from '@/lib/chart/drawingGeometry'
import {
  DEFAULT_ZONE_COLORS,
  DRAWING_TOOL_TYPES,
  PRESET_NAME_MAX_LENGTH,
  useDrawingSettingsStore,
  type WidgetFieldKey
} from '@/store/drawingSettingsStore'
import { useReplayStore } from '@/store/replayStore'
import type { DrawingToolType } from '@/lib/chart/drawingGeometry'

const TOOL_LABELS: Record<DrawingToolType, string> = {
  hline: 'H. line',
  trendline: 'Trend',
  fib: 'Fib',
  rect: 'Rect',
  long: 'Long',
  short: 'Short'
}

const LINE_STYLE_OPTIONS = [
  { value: LineStyle.Solid, label: 'Solid' },
  { value: LineStyle.Dotted, label: 'Dotted' },
  { value: LineStyle.Dashed, label: 'Dashed' },
  { value: LineStyle.LargeDashed, label: 'Large dashed' },
  { value: LineStyle.SparseDotted, label: 'Sparse dotted' }
]

const WIDTH_OPTIONS = [
  { value: 1, label: '1px' },
  { value: 2, label: '2px' },
  { value: 3, label: '3px' },
  { value: 4, label: '4px' }
]

function ColorSwatch({
  label,
  value,
  onChange,
  compact = false
}: {
  label: string
  value: string
  onChange: (color: string) => void
  compact?: boolean
}) {
  return (
    <label
      className={`flex flex-col gap-0.5 ${compact ? 'w-[4.5rem] flex-none' : 'min-w-[4.5rem] flex-1'}`}
    >
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </span>
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
    </label>
  )
}

function StyleControls({
  style,
  onChange,
  showZoneColors = false
}: {
  style: DrawingStyle
  onChange: (patch: Partial<DrawingStyle>) => void
  showZoneColors?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <ColorSwatch
          label="Color"
          value={style.color}
          onChange={(color) => onChange({ color })}
        />
        <label className="flex min-w-[4rem] flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            Width
          </span>
          <select
            value={String(style.lineWidth)}
            onChange={(event) => onChange({ lineWidth: Number(event.target.value) })}
            className="h-6 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs text-zinc-200 focus:border-amber-500/70 focus:outline-none"
          >
            {WIDTH_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[6.5rem] flex-1 flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            Line style
          </span>
          <select
            value={String(style.lineStyle)}
            onChange={(event) => onChange({ lineStyle: Number(event.target.value) as DrawingLineStyle })}
            className="h-6 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs text-zinc-200 focus:border-amber-500/70 focus:outline-none"
          >
            {LINE_STYLE_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {showZoneColors && (
        <div className="flex items-end gap-2">
          <ColorSwatch
            label="TP fill"
            value={style.tpColor ?? DEFAULT_ZONE_COLORS.tp}
            onChange={(color) => onChange({ tpColor: color })}
            compact
          />
          <ColorSwatch
            label="SL fill"
            value={style.slColor ?? DEFAULT_ZONE_COLORS.sl}
            onChange={(color) => onChange({ slColor: color })}
            compact
          />
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): ReactElement {
  return (
    <section className="border-b border-zinc-800/80 px-4 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
          {title}
        </h3>
        {hint && <span className="text-[10px] text-zinc-600">{hint}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function FibLevelsEditor({
  levels,
  accentColor,
  onChange
}: {
  levels: FibLevelConfig[]
  accentColor: string
  onChange: (levels: FibLevelConfig[]) => void
}): ReactElement {
  const commitLevel = (index: number, patch: Partial<FibLevelConfig>): void => {
    onChange(levels.map((level, i) => (i === index ? { ...level, ...patch } : level)))
  }
  const removeLevel = (index: number): void => {
    onChange(levels.filter((_, i) => i !== index))
  }
  const addLevel = (): void => {
    const last = levels[levels.length - 1]
    const ratio = last ? Math.min(10, Math.round((last.ratio + 0.236) * 10000) / 10000) : 0.5
    onChange([...levels, { ratio }])
  }

  return (
    <div className="flex flex-col gap-1">
      {levels.length === 0 && (
        <p className="text-xs text-zinc-600">No levels — add one to show fib lines.</p>
      )}
      {levels.map((level, index) => {
        const hasColor = level.color != null
        return (
          <div key={index} className="flex items-center gap-1.5">
            <input
              type="number"
              step="0.001"
              min="-20"
              max="20"
              value={String(level.ratio)}
              aria-label={`Level ${index + 1} ratio`}
              onChange={(event) => {
                const ratio = event.target.valueAsNumber
                if (!Number.isFinite(ratio)) return
                commitLevel(index, { ratio })
              }}
              className="h-6 w-16 shrink-0 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs text-zinc-200 focus:border-amber-500/70 focus:outline-none"
            />
            <label
              className="relative block h-6 w-9 shrink-0 cursor-pointer overflow-hidden rounded border border-zinc-700"
              style={{
                background: level.color ?? accentColor,
                opacity: hasColor ? 1 : 0.35
              }}
              title={hasColor ? 'Custom level color' : 'Inherits drawing color — click to set one'}
            >
              <input
                type="color"
                value={level.color ?? accentColor}
                aria-label={`Level ${index + 1} color`}
                onChange={(event) => commitLevel(index, { color: event.target.value })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              {!hasColor && (
                <span className="pointer-events-none absolute inset-0 grid place-items-center text-[9px] font-bold text-zinc-950">
                  A
                </span>
              )}
            </label>
            <button
              type="button"
              aria-label="Inherit drawing color"
              title="Inherit the drawing color"
              disabled={!hasColor}
              onClick={() => commitLevel(index, { color: undefined })}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Undo2 className="h-3 w-3" aria-hidden />
            </button>
            <select
              value={level.lineStyle == null ? -1 : level.lineStyle}
              aria-label={`Level ${index + 1} line style`}
              onChange={(event) => {
                const value = Number(event.target.value)
                commitLevel(index, {
                  lineStyle: value < 0 ? undefined : (value as DrawingLineStyle)
                })
              }}
              className="h-6 min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-1 text-xs text-zinc-200 focus:border-amber-500/70 focus:outline-none"
            >
              <option value={-1}>Auto</option>
              {LINE_STYLE_OPTIONS.map((option) => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={`Remove level ${index + 1}`}
              onClick={() => removeLevel(index)}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={addLevel}
        className="mt-1 text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
      >
        + Add level
      </button>
    </div>
  )
}

export default function DrawingSettingsDialog(): ReactElement | null {
  const open = useDrawingSettingsStore((s) => s.drawingDialogOpen)
  const source = useDrawingSettingsStore((s) => s.drawingDialogSource)
  const setOpen = useDrawingSettingsStore((s) => s.setDrawingDialogOpen)
  const toolDefaults = useDrawingSettingsStore((s) => s.toolDefaults)
  const presets = useDrawingSettingsStore((s) => s.presets)
  const widgetFields = useDrawingSettingsStore((s) => s.widgetFields)
  const setToolDefault = useDrawingSettingsStore((s) => s.setToolDefault)
  const savePreset = useDrawingSettingsStore((s) => s.savePreset)
  const restorePreset = useDrawingSettingsStore((s) => s.restorePreset)
  const deletePreset = useDrawingSettingsStore((s) => s.deletePreset)
  const setWidgetField = useDrawingSettingsStore((s) => s.setWidgetField)
  const resetToolDefaults = useDrawingSettingsStore((s) => s.resetToolDefaults)
  const fibLevelDefaults = useDrawingSettingsStore((s) => s.fibLevels)
  const setFibLevels = useDrawingSettingsStore((s) => s.setFibLevels)
  const resetFibLevels = useDrawingSettingsStore((s) => s.resetFibLevels)

  const drawings = useReplayStore((s) => s.drawings)
  const selectedDrawingId = useReplayStore((s) => s.selectedDrawingId)
  const updateDrawingStyle = useReplayStore((s) => s.updateDrawingStyle)
  const updateDrawingLevels = useReplayStore((s) => s.updateDrawingLevels)

  const [activeTool, setActiveTool] = useState<DrawingToolType>('trendline')
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedDrawing = drawings.find((d) => d.id === selectedDrawingId) ?? null
  const selectedStyle: DrawingStyle | null =
    selectedDrawing != null && selectedDrawing.type === activeTool
      ? selectedDrawing.style ?? toolDefaults[selectedDrawing.type]
      : null

  useEffect(() => {
    if (!open) return
    const drawing = useReplayStore.getState().drawings.find(
      (d) => d.id === useReplayStore.getState().selectedDrawingId
    )
    if (drawing) setActiveTool(drawing.type)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      if (saveAsOpen) {
        setSaveAsOpen(false)
        return
      }
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen, saveAsOpen])

  useEffect(() => {
    if (!saveAsOpen) return
    setPresetName('')
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [saveAsOpen])

  if (!open) return null

  const defaultStyle = toolDefaults[activeTool]
  const fields = widgetFields[activeTool]
  const toolPresets = [...presets[activeTool]].sort((a, b) => b.savedAt - a.savedAt)

  const editingFibDrawing =
    source === 'widget' && selectedDrawing?.type === 'fib' ? selectedDrawing : null
  const fibLevels: FibLevelConfig[] = editingFibDrawing
    ? (editingFibDrawing.levels ?? fibLevelDefaults)
    : fibLevelDefaults
  const fibAccentColor =
    (editingFibDrawing?.style ?? defaultStyle)?.color ?? DEFAULT_ZONE_COLORS.tp
  const onFibLevelsChange = (next: FibLevelConfig[]): void => {
    if (editingFibDrawing) {
      updateDrawingLevels(editingFibDrawing.id, next)
    } else {
      setFibLevels(next)
    }
  }

  function applyPreset(presetId: string): void {
    restorePreset(activeTool, presetId)
    if (selectedStyle != null && selectedDrawing != null) {
      const preset = presets[activeTool].find((item) => item.id === presetId)
      if (preset) {
        updateDrawingStyle(selectedDrawing.id, {
          color: preset.color,
          lineWidth: preset.lineWidth,
          lineStyle: preset.lineStyle,
          tpColor: preset.tpColor,
          slColor: preset.slColor
        })
      }
    }
  }

  const trimmedName = presetName.trim()

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawing-settings-title"
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-lg flex-col overflow-visible rounded border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2.5">
          <h2 id="drawing-settings-title" className="text-sm font-semibold text-amber-400">
            Drawing Settings
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {source !== 'widget' && (
            <Section title="Tool">
              <div className="flex flex-wrap gap-1">
                {DRAWING_TOOL_TYPES.map((tool) => {
                  const active = tool === activeTool
                  return (
                    <button
                      key={tool}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setActiveTool(tool)
                        setSaveAsOpen(false)
                      }}
                      className={`h-7 rounded border px-2.5 text-xs font-medium transition-colors ${
                        active
                          ? 'border-amber-500/70 bg-amber-950/40 text-amber-300'
                          : 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
                      }`}
                    >
                      {TOOL_LABELS[tool]}
                    </button>
                  )
                })}
              </div>
            </Section>
          )}

          <Section title="Default style" hint="Applied to newly drawn tools">
            <StyleControls
              style={defaultStyle}
              showZoneColors={activeTool === 'long' || activeTool === 'short'}
              onChange={(patch) => setToolDefault(activeTool, patch)}
            />
            <button
              type="button"
              onClick={() => resetToolDefaults(activeTool)}
              className="mt-1.5 text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              Reset defaults
            </button>
          </Section>

          {selectedStyle != null && selectedDrawing != null && (
            <Section title="Selected drawing" hint="Overrides this drawing only">
              <StyleControls
                style={selectedStyle}
                showZoneColors={activeTool === 'long' || activeTool === 'short'}
                onChange={(patch) => updateDrawingStyle(selectedDrawing.id, patch)}
              />
              <button
                type="button"
                onClick={() => {
                  updateDrawingStyle(selectedDrawing.id, {
                    color: defaultStyle.color,
                    lineWidth: defaultStyle.lineWidth,
                    lineStyle: defaultStyle.lineStyle,
                    tpColor: defaultStyle.tpColor,
                    slColor: defaultStyle.slColor
                  })
                  if (selectedDrawing.type === 'fib') {
                    updateDrawingLevels(
                      selectedDrawing.id,
                      fibLevelDefaults.map((level) => ({ ...level }))
                    )
                  }
                }}
                className="mt-1.5 text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              >
                Apply defaults to this drawing
              </button>
            </Section>
          )}

          {activeTool === 'fib' && (
            <Section
              title="Fib levels"
              hint={
                editingFibDrawing
                  ? 'Overrides this fib only'
                  : 'Used by new fib drawings'
              }
            >
              <FibLevelsEditor
                levels={fibLevels}
                accentColor={fibAccentColor}
                onChange={onFibLevelsChange}
              />
              {!editingFibDrawing && (
                <button
                  type="button"
                  onClick={resetFibLevels}
                  className="mt-1.5 text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                >
                  Reset to default levels
                </button>
              )}
            </Section>
          )}

          <Section title="Floating widget" hint="Controls shown in the compact widget">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {(
                [
                  { key: 'color', label: 'Color' },
                  { key: 'lineWidth', label: 'Width' },
                  { key: 'lineStyle', label: 'Line style' },
                  ...(activeTool === 'long' || activeTool === 'short'
                    ? [
                        { key: 'tpColor' as const, label: 'TP fill' },
                        { key: 'slColor' as const, label: 'SL fill' }
                      ]
                    : [])
                ] as { key: WidgetFieldKey; label: string }[]
              ).map(({ key, label }) => {
                const checked = fields[key]
                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <span className="text-xs text-zinc-300">{label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={checked}
                      onClick={() => setWidgetField(activeTool, key, !checked)}
                      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                        checked ? 'bg-amber-500/80' : 'bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full shadow transition-all ${
                          checked ? 'translate-x-3 bg-white' : 'translate-x-0 bg-zinc-400'
                        }`}
                      />
                    </button>
                  </label>
                )
              })}
            </div>
          </Section>

          <Section title="Presets" hint="Saved styles for this tool">
            {toolPresets.length === 0 && (
              <p className="text-xs text-zinc-600">
                No presets saved yet — capture the current style to reuse it later.
              </p>
            )}
            <div className="flex flex-col gap-1">
              {toolPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/50 px-2 py-0.5"
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded border border-zinc-700"
                    style={{ background: preset.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
                    {preset.name}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                    {preset.lineWidth}px
                  </span>
                  <button
                    type="button"
                    onClick={() => applyPreset(preset.id)}
                    className="inline-flex h-6 items-center rounded border border-zinc-700 px-1.5 text-[10px] font-medium text-zinc-300 hover:border-amber-500/60 hover:text-amber-300"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${preset.name}`}
                    onClick={() => deletePreset(activeTool, preset.id)}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              ))}
            </div>

            {saveAsOpen ? (
              <form
                className="mt-1.5 flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!trimmedName) return
                  if (savePreset(activeTool, trimmedName, selectedStyle ?? defaultStyle)) {
                    setSaveAsOpen(false)
                  }
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={presetName}
                  maxLength={PRESET_NAME_MAX_LENGTH}
                  placeholder="Preset name…"
                  onChange={(event) => setPresetName(event.target.value)}
                  className="h-7 min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 focus:border-amber-500/70 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!trimmedName}
                  aria-label="Save preset"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-amber-500/40 text-amber-300 hover:border-amber-400/70 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-600"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Cancel saving preset"
                  onClick={() => setSaveAsOpen(false)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-100"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setSaveAsOpen(true)}
                className="mt-1.5 text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              >
                Save current as preset…
              </button>
            )}
          </Section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-2.5">
          <span className="text-[10px] text-zinc-600">
            Defaults affect new drawings; widget applies to the selected drawing.
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-7 items-center rounded border border-zinc-700 px-3 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}