import { useEffect } from 'react'
import { useReplayStore } from '@/store/replayStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
}

/**
 * UI keyboard shortcuts (live + replay):
 * - F → toggle chart fullscreen
 * - Escape → cancel pending trend line / return to select tool
 * - Delete / Backspace → delete the selected drawing
 */
export function useUiHotkeys(): void {
  const toggleChartFullscreen = useUiLayoutStore((s) => s.toggleChartFullscreen)
  const setDrawTool = useReplayStore((s) => s.setDrawTool)
  const deleteDrawing = useReplayStore((s) => s.deleteDrawing)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) return
      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (event.key === 'Escape') {
        const state = useReplayStore.getState()
        if (state.pendingTrend || state.drawTool !== 'select') {
          event.preventDefault()
          setDrawTool('select')
        }
        return
      }

      if (event.repeat) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const state = useReplayStore.getState()
        if (state.selectedDrawingId != null) {
          event.preventDefault()
          deleteDrawing(state.selectedDrawingId)
        }
        return
      }

      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        toggleChartFullscreen()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleChartFullscreen, setDrawTool, deleteDrawing])
}
