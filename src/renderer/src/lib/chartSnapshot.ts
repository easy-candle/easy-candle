import type { IChartApi } from 'lightweight-charts'
import { themedWordmarkUrl } from '@/lib/chartWordmark'
import { CHART_PALETTES } from '@/lib/theme'
import { useThemeStore } from '@/store/themeStore'
import { APP_NAME } from '@shared/appName'

const HEADER_HEIGHT = 32
/** Matches CandleChart wordmark overlay: w-[min(48%,380px)] top-[58%] opacity-[0.08]. */
const WORDMARK_OPACITY = 0.08
const WORDMARK_TOP = 0.58
const WORDMARK_MAX_WIDTH = 380
const WORDMARK_WIDTH_RATIO = 0.48
const WORDMARK_ASPECT = 220 / 900

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('wordmark load failed'))
    image.src = src
  })
}

/** Draw the Easy Candle wordmark the same way it sits on the live chart. */
function drawWordmark(
  ctx: CanvasRenderingContext2D,
  wordmark: HTMLImageElement,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  headerPx: number
): void {
  const destW = Math.min(cssWidth * WORDMARK_WIDTH_RATIO, WORDMARK_MAX_WIDTH) * dpr
  const destH = destW * WORDMARK_ASPECT
  const destX = (cssWidth / 2) * dpr - destW / 2
  const destY = headerPx + cssHeight * WORDMARK_TOP * dpr - destH / 2

  ctx.save()
  ctx.globalAlpha = WORDMARK_OPACITY
  ctx.drawImage(wordmark, destX, destY, destW, destH)
  ctx.restore()
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

/** Composite the chart (header + chart + wordmark + drawing overlay) onto a single canvas. */
async function compositeSnapshot(chart: IChartApi, symbol: string): Promise<HTMLCanvasElement> {
  const source = chart.takeScreenshot()
  const chartEl = chart.chartElement()
  const cssWidth = chartEl?.clientWidth ?? source.width
  const dpr = cssWidth > 0 ? source.width / cssWidth : 1
  const cssHeight = chartEl?.clientHeight ?? source.height / dpr
  const headerPx = HEADER_HEIGHT * dpr
  const palette = CHART_PALETTES[useThemeStore.getState().theme]
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height + headerPx

  const ctx = canvas.getContext('2d')
  if (!ctx) return source

  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, canvas.width, headerPx)

  ctx.fillStyle = palette.scaleBorder
  ctx.fillRect(0, headerPx - Math.max(1, dpr), canvas.width, Math.max(1, dpr))

  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.font = `600 ${14 * dpr}px "Segoe UI", sans-serif`
  ctx.fillStyle = palette.text
  ctx.fillText(symbolLabel(symbol), 12 * dpr, headerPx / 2)

  ctx.textAlign = 'right'
  ctx.font = `500 ${12 * dpr}px "Segoe UI", sans-serif`
  ctx.fillText(`${APP_NAME} · ${timestampLabel()}`, canvas.width - 12 * dpr, headerPx / 2)

  ctx.drawImage(source, 0, headerPx)

  try {
    const wordmark = await loadImage(themedWordmarkUrl(useThemeStore.getState().theme))
    drawWordmark(ctx, wordmark, cssWidth, cssHeight, dpr, headerPx)
  } catch {
    // Wordmark is best-effort; keep the chart snapshot.
  }

  const overlay = findOverlaySvg(chart)
  if (overlay) {
    try {
      const overlayCanvas = await svgToCanvas(overlay)
      ctx.drawImage(overlayCanvas, 0, headerPx, source.width, source.height)
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
