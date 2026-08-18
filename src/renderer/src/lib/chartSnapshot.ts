import type { IChartApi } from 'lightweight-charts'

/** Render the chart to a PNG data URL. */
function chartToDataUrl(chart: IChartApi): string {
  const canvas = chart.takeScreenshot()
  return canvas.toDataURL('image/png')
}

/** Render the chart to a PNG blob. */
function chartToBlob(chart: IChartApi): Promise<Blob | null> {
  const canvas = chart.takeScreenshot()
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

function snapshotFileName(symbol: string): string {
  const safe = symbol.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'chart'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${safe}-${stamp}.png`
}

export function downloadChartSnapshot(chart: IChartApi, symbol: string): void {
  const dataUrl = chartToDataUrl(chart)
  const link = document.createElement('a')
  link.download = snapshotFileName(symbol)
  link.href = dataUrl
  link.click()
}

export async function copyChartSnapshot(chart: IChartApi): Promise<boolean> {
  try {
    const blob = await chartToBlob(chart)
    if (!blob) return false
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}
