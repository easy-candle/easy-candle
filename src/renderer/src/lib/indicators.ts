import type { Candle } from '@shared/candleUtils'
import { computeSmc } from '@/lib/smc/compute'
import { isEmptyScene } from '@/lib/smc/settings'
import type { SmcScene } from '@/lib/smc/types'

export type OverlayPoint = {
  time: number
  value: number
}

export type LineOverlay = {
  id: string
  type: 'line'
  data: OverlayPoint[]
  color?: string
}

export type SmcChartOverlay = {
  id: string
  type: 'smc'
  scene: SmcScene
}

export type ChartOverlay = LineOverlay | SmcChartOverlay

type LineIndicatorDefinition = {
  id: string
  label: string
  color: string
  kind?: 'line'
  requiresAuth?: boolean
  period: number
  compute: (candles: Candle[], params?: { period?: number }) => OverlayPoint[]
}

type SmcIndicatorDefinition = {
  id: string
  label: string
  color: string
  kind: 'smc'
  requiresAuth?: boolean
  compute: (candles: Candle[]) => SmcScene
}

export type IndicatorDefinition = LineIndicatorDefinition | SmcIndicatorDefinition

export function computeSma(candles: Candle[], params: { period?: number } = {}): OverlayPoint[] {
  const period = Math.max(1, Math.floor(Number(params.period) || 20))
  if (!Array.isArray(candles) || candles.length < period) return []

  const out: OverlayPoint[] = []
  let sum = 0

  for (let i = 0; i < candles.length; i += 1) {
    sum += candles[i].close
    if (i >= period) {
      sum -= candles[i - period].close
    }
    if (i >= period - 1) {
      out.push({
        time: candles[i].time,
        value: sum / period
      })
    }
  }

  return out
}

export function computeEma(candles: Candle[], params: { period?: number } = {}): OverlayPoint[] {
  const period = Math.max(1, Math.floor(Number(params.period) || 20))
  if (!Array.isArray(candles) || candles.length < period) return []

  const k = 2 / (period + 1)
  let sum = 0
  for (let i = 0; i < period; i += 1) {
    sum += candles[i].close
  }

  let ema = sum / period
  const out: OverlayPoint[] = [{ time: candles[period - 1].time, value: ema }]

  for (let i = period; i < candles.length; i += 1) {
    ema = candles[i].close * k + ema * (1 - k)
    out.push({ time: candles[i].time, value: ema })
  }

  return out
}

export const INDICATORS: IndicatorDefinition[] = [
  {
    id: 'sma20',
    label: 'Simple moving average 20',
    color: '#38bdf8',
    period: 20,
    compute: (candles) => computeSma(candles, { period: 20 })
  },
  {
    id: 'ema20',
    label: 'Exponential moving average 20',
    color: '#f472b6',
    period: 20,
    compute: (candles) => computeEma(candles, { period: 20 })
  },
  {
    id: 'smc',
    label: 'Smart money concepts',
    color: '#089981',
    kind: 'smc',
    compute: computeSmc
  }
]

export function getIndicator(id: string): IndicatorDefinition | null {
  return INDICATORS.find((entry) => entry.id === id) ?? null
}

export function indicatorRequiresAuth(id: string): boolean {
  return getIndicator(id)?.requiresAuth === true
}

/** Drop signed-in-only indicators when the session is anonymous. */
export function ungatedIndicatorIds(activeIds: string[], signedIn: boolean): string[] {
  if (!Array.isArray(activeIds) || !activeIds.length) return []
  if (signedIn) return activeIds
  return activeIds.filter((id) => !indicatorRequiresAuth(id))
}

export function buildOverlays(candles: Candle[], activeIds: string[] = []): ChartOverlay[] {
  if (!Array.isArray(candles) || !candles.length) return []
  if (!Array.isArray(activeIds) || !activeIds.length) return []

  const overlays: ChartOverlay[] = []

  for (const id of activeIds) {
    const def = getIndicator(id)
    if (!def) continue
    if (def.kind === 'smc') {
      const scene = def.compute(candles)
      if (isEmptyScene(scene)) continue
      overlays.push({ id: def.id, type: 'smc', scene })
      continue
    }
    const data = def.compute(candles)
    if (!data.length) continue
    overlays.push({
      id: def.id,
      type: 'line',
      data,
      color: def.color
    })
  }

  return overlays
}
