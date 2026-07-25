import { useEffect } from 'react'
import { useReplayStore } from '@/store/replayStore'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"))
}

/**
 * Replay keyboard shortcuts:
 * - Space while playing → pause
 * - Space while paused/ready → step forward one candle
 * - Escape → cancel pending trend line / return to select tool
 */
export function useReplayHotkeys(): void {
  const mode = useReplayStore((s) => s.mode)
  const pause = useReplayStore((s) => s.pause)
  const stepForward = useReplayStore((s) => s.stepForward)
  const setDrawTool = useReplayStore((s) => s.setDrawTool)

  useEffect(() => {
    if (mode !== 'replay') return undefined

    function onKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) return

      const state = useReplayStore.getState()
      if (state.mode !== 'replay') return

      if (event.key === 'Escape') {
        if (state.pendingTrend || state.drawTool !== 'select') {
          event.preventDefault()
          setDrawTool('select')
        }
        return
      }

      if (event.code !== 'Space' && event.key !== ' ') return
      if (event.repeat) return
      if (state.replayLoading) return

      event.preventDefault()

      if (state.isPlaying) {
        pause()
        return
      }

      if (state.replayStatus === 'ended') return
      stepForward()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, pause, stepForward, setDrawTool])
}
