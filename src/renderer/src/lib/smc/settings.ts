import type { SmcSettings } from './types'

/** Lookbacks and colors aligned with LuxAlgo Smart Money Concepts defaults. */
export const DEFAULT_SMC_SETTINGS: SmcSettings = {
  internalPivotSize: 5,
  swingPivotSize: 50,
  maxPrimitives: 100,
  atrPeriod: 200,
  obFilterMult: 2,
  internalOrderBlockCount: 5,
  swingOrderBlockCount: 0,
  bullColor: '#089981',
  bearColor: '#F23645',
  bullObFill: 'rgba(49, 121, 245, 0.2)',
  bearObFill: 'rgba(247, 124, 128, 0.2)',
  bullFvgFill: 'rgba(0, 255, 104, 0.12)',
  bearFvgFill: 'rgba(255, 0, 8, 0.12)',
  bullFvgBorder: 'rgba(0, 255, 104, 0.65)',
  bearFvgBorder: 'rgba(255, 0, 8, 0.65)'
}

export function isEmptyScene(scene: { segments: unknown[]; boxes: unknown[]; labels: unknown[] }): boolean {
  return scene.segments.length === 0 && scene.boxes.length === 0 && scene.labels.length === 0
}
