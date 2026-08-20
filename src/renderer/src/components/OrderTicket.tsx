import OrderTicketForm from '@/components/OrderTicketForm'
import { useReplayStore } from '@/store/replayStore'

/** TradingView-style order ticket to the right of the chart. */
export default function OrderTicket() {
  const mode = useReplayStore((s) => s.mode)
  if (mode !== 'replay') return null

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950/90">
      <div className="shrink-0 border-b border-zinc-800/80 px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Order ticket</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <OrderTicketForm />
      </div>
    </aside>
  )
}
