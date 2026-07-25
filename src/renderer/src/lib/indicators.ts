import type { Candle } from '@shared/candleUtils'

export type OverlayPoint = {
  time: number
  value: number
}

export type ChartOverlay = {
  id: string
  type: 'line'
  data: OverlayPoint[]
  color?: string
}

export type IndicatorDefinition = {
  id: string
  label: string
  color: string
  period: number
  compute: (candles: Candle[], params?: { period?: number }) => OverlayPoint[]
}

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
    label: 'SMA 20',
    color: '#38bdf8',
    period: 20,
    compute: (candles) => computeSma(candles, { period: 20 })
  },
  {
    id: 'ema20',
    label: 'EMA 20',
    color: '#f472b6',
    period: 20,
    compute: (candles) => computeEma(candles, { period: 20 })
  }
]

export function getIndicator(id: string): IndicatorDefinition | null {
  return INDICATORS.find((entry) => entry.id === id) ?? null
}

export function buildOverlays(candles: Candle[], activeIds: string[] = []): ChartOverlay[] {
  if (!Array.isArray(candles) || !candles.length) return []
  if (!Array.isArray(activeIds) || !activeIds.length) return []

  const overlays: ChartOverlay[] = []

  for (const id of activeIds) {
    const def = getIndicator(id)
    if (!def) continue
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
