import type { IChartApi } from 'lightweight-charts'
import { CHART_PALETTES } from '@/lib/theme'
import { useThemeStore } from '@/store/themeStore'
import { APP_NAME } from '@shared/appName'

const HEADER_HEIGHT = 32

/** Display form of the symbol, e.g. "BTCUSDT". */
function symbolLabel(symbol: string): string {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return clean || 'Chart'
}

function timestampLabel(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The drawing/trade overlay SVG rendered on top of the chart, if any. */
function findOverlaySvg(chart: IChartApi): SVGSVGElement | null {
  const element = chart.chartElement()
  if (!element) return null
  let node: HTMLElement | null = element
  while (node) {
    const svg = node.querySelector<SVGSVGElement>('svg[data-snapshot-layer]')
    if (svg) return svg
    node = node.parentElement
  }
  return null
}

/** Rasterize an inline SVG (no external refs) onto an offscreen canvas. */
function svgToCanvas(svg: SVGSVGElement): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      new XMLSerializer().serializeToString(clone)
    )}`
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = svg.clientWidth
      canvas.height = svg.clientHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('2d context unavailable'))
        return
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas)
    }
    image.onerror = () => reject(new Error('snapshot overlay rasterization failed'))
    image.src = url
  })
}

/** Composite the chart (header + chart + drawing overlay) onto a single canvas. */
async function compositeSnapshot(chart: IChartApi, symbol: string): Promise<HTMLCanvasElement> {
  const source = chart.takeScreenshot()
  const palette = CHART_PALETTES[useThemeStore.getState().theme]
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height + HEADER_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) return source

  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, canvas.width, HEADER_HEIGHT)

  ctx.fillStyle = palette.scaleBorder
  ctx.fillRect(0, HEADER_HEIGHT - 1, canvas.width, 1)

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = '600 14px "Segoe UI", sans-serif'
  ctx.fillStyle = palette.text
  ctx.fillText(symbolLabel(symbol), 12, HEADER_HEIGHT / 2)

  ctx.textAlign = 'right'
  ctx.font = '500 12px "Segoe UI", sans-serif'
  ctx.fillText(`${APP_NAME} · ${timestampLabel()}`, canvas.width - 12, HEADER_HEIGHT / 2)

  ctx.drawImage(source, 0, HEADER_HEIGHT)

  const overlay = findOverlaySvg(chart)
  if (overlay) {
    try {
      const overlayCanvas = await svgToCanvas(overlay)
      ctx.drawImage(overlayCanvas, 0, HEADER_HEIGHT)
    } catch {
      // Rasterizing the overlay is best-effort; keep the chart snapshot.
    }
  }

  return canvas
}

async function chartToDataUrl(chart: IChartApi, symbol: string): Promise<string> {
  return (await compositeSnapshot(chart, symbol)).toDataURL('image/png')
}

async function chartToBlob(chart: IChartApi, symbol: string): Promise<Blob | null> {
  const canvas = await compositeSnapshot(chart, symbol)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

function snapshotFileName(symbol: string): string {
  const safe = symbol.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'chart'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${safe}-${stamp}.png`
}

export async function downloadChartSnapshot(chart: IChartApi, symbol: string): Promise<void> {
  const dataUrl = await chartToDataUrl(chart, symbol)
  const link = document.createElement('a')
  link.download = snapshotFileName(symbol)
  link.href = dataUrl
  link.click()
}

export async function copyChartSnapshot(chart: IChartApi, symbol: string): Promise<boolean> {
  try {
    const blob = await chartToBlob(chart, symbol)
    if (!blob) return false
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}
