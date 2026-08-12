import FloatingPanel from '@/components/FloatingPanel'
import DrawingToolbar from '@/components/DrawingToolbar'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

/** Floating drawing tools for fullscreen replay (top-left by default). */
export default function FloatingDrawingBar() {
  const pos = useUiLayoutStore((s) => s.drawingToolbarPos)
  const setDrawingToolbarPos = useUiLayoutStore((s) => s.setDrawingToolbarPos)

  return (
    <FloatingPanel
      title="Draw"
      pos={pos}
      onPosChange={setDrawingToolbarPos}
      defaultPlacement="top-left"
    >
      <DrawingToolbar variant="floating" />
    </FloatingPanel>
  )
}
