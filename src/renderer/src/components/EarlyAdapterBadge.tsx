import { Sparkles } from 'lucide-react'
import Tooltip from '@/components/Tooltip'

export default function EarlyAdapterBadge() {
  return (
    <Tooltip text="Early adapter" className="shrink-0">
      <span
        aria-label="Early adapter"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/40"
      >
        <Sparkles className="h-2.5 w-2.5" aria-hidden />
      </span>
    </Tooltip>
  )
}
