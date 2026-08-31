import type { ReactNode } from 'react'

export type ImportProgress = {
  label: string
  percent: number
}

type ImportProgressBarProps = {
  progress: ImportProgress
}

export default function ImportProgressBar({ progress }: ImportProgressBarProps): ReactNode {
  const percent = Math.max(0, Math.min(100, progress.percent))
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[11px] tabular-nums text-zinc-500">
        <span className="min-w-0 truncate text-zinc-400">{progress.label}</span>
        <span>{percent.toFixed(0)}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded bg-zinc-800"
        role="progressbar"
        aria-label={progress.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <div
          className="h-full rounded bg-amber-500 transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
