import FloatingPanel from '@/components/FloatingPanel'
import OrderTicketForm from '@/components/OrderTicketForm'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

/** Compact order ticket for fullscreen replay (no trade history). */
export default function FloatingTradeBar() {
  const pos = useUiLayoutStore((s) => s.tradePanelPos)
  const setTradePanelPos = useUiLayoutStore((s) => s.setTradePanelPos)

  return (
    <FloatingPanel
      title="Trade"
      pos={pos}
      onPosChange={setTradePanelPos}
      defaultPlacement="top-right"
    >
      <OrderTicketForm compact />
    </FloatingPanel>
  )
}
