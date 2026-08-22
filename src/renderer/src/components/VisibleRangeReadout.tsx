import { History } from 'lucide-react'
import { formatUtcCandleTime } from '@/lib/utcDateTime'
import type { VisibleRangeInfo } from '@/lib/chart/visibleRange'

/**
 * Live readout of the chart's visible logical range, driven by
 * `subscribeVisibleLogicalRangeChange`. Also surfaces the range-based loading
 * hook: it shows the UTC window the viewport covers, how many empty slots sit
 * past each end of the loaded series, and the last history-edge request.
 */
export default function VisibleRangeReadout({
  info,
  loadedCount,
  historyRequest,
  /** True when the data source pages older bars in on a history edge. */
  historyPaging = false,
  /** True while an older page is in flight. */
  historyLoading = false
}: {
  info: VisibleRangeInfo | null
  loadedCount: number
  historyRequest: { count: number; untilTime: number } | null
  historyPaging?: boolean
  historyLoading?: boolean
}) {
  if (!info) return null

  const edgeLabel = historyLoading
    ? 'loading until'
    : historyPaging
      ? 'loaded until'
      : 'would load until'

  return (
    <div className="pointer-events-none absolute bottom-10 left-2 z-[2] flex flex-col gap-0.5 rounded border border-zinc-800 bg-zinc-950/85 px-2 py-1.5 text-[10px] leading-tight tabular-nums text-zinc-400">
      <span>
        Bars {info.from.toFixed(1)} → {info.to.toFixed(1)} of {loadedCount.toLocaleString()}
      </span>
      <span className="text-zinc-500">
        {formatUtcCandleTime(info.fromTime)} → {formatUtcCandleTime(info.toTime)}
      </span>
      <span className="text-zinc-600">
        Empty left {info.barsBefore.toFixed(0)} · right {info.barsAfter.toFixed(0)}
      </span>
      {info.atStart && historyRequest && (
        <span className="inline-flex items-center gap-1 text-amber-400/90">
          <History className="h-3 w-3" aria-hidden />
          History edge ×{historyRequest.count} · {edgeLabel}{' '}
          {formatUtcCandleTime(historyRequest.untilTime)}
        </span>
      )}
    </div>
  )
}
