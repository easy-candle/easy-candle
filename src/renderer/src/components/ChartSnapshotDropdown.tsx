import { useState } from 'react'
import { Camera, Check, Copy, Download } from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import Tooltip from '@/components/Tooltip'
import { copyChartSnapshot, downloadChartSnapshot } from '@/lib/chartSnapshot'
import { useUiLayoutStore } from '@/store/uiLayoutStore'
import { useReplayStore } from '@/store/replayStore'

export default function ChartSnapshotDropdown() {
  const [copied, setCopied] = useState(false)

  return (
    <Dropdown
      align="end"
      menuClassName="w-48"
      trigger={({ open, toggle }) => (
        <Tooltip text="Screenshot" side="bottom">
          <button
            type="button"
            onClick={toggle}
            aria-label="Chart snapshot"
            aria-expanded={open}
            data-tour="snapshot"
            className={`inline-flex h-8 items-center gap-1.5 rounded border px-2 text-xs font-medium transition-colors ${
              open
                ? 'border-amber-500/70 bg-amber-950/40 text-amber-300'
                : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
            }`}
          >
            <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
        </Tooltip>
      )}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          const chart = useUiLayoutStore.getState().primaryChart
          const symbol = useReplayStore.getState().symbol || 'chart'
          if (chart) void downloadChartSnapshot(chart, symbol)
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100"
      >
        <Download className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
        <span className="flex-1 font-medium">Download Image</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          const chart = useUiLayoutStore.getState().primaryChart
          const symbol = useReplayStore.getState().symbol || 'chart'
          if (!chart) return
          void copyChartSnapshot(chart, symbol).then((success) => {
            if (success) {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 2000)
            }
          })
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800/80 hover:text-zinc-100"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
        )}
        <span className="flex-1 font-medium">{copied ? 'Copied!' : 'Copy Image'}</span>
      </button>
    </Dropdown>
  )
}
