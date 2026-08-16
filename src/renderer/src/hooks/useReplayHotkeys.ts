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
 * - Space → play/pause (toggles; steps are handled by arrow keys)
 * - ArrowRight → step forward one candle (hold to keep stepping)
 * - ArrowLeft → step backward one candle (hold to keep stepping)
 * - Tab (split only) → toggle next-candle pane (left ↔ right)
 */
export function useReplayHotkeys(): void {
  const mode = useReplayStore((s) => s.mode)
  const play = useReplayStore((s) => s.play)
  const pause = useReplayStore((s) => s.pause)
  const stepForward = useReplayStore((s) => s.stepForward)
  const stepBackward = useReplayStore((s) => s.stepBackward)
  const setDriverPane = useReplayStore((s) => s.setDriverPane)

  useEffect(() => {
    if (mode !== 'replay') return undefined

    function onKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) return

      const state = useReplayStore.getState()
      if (state.mode !== 'replay') return

      if (event.key === 'Tab' && state.chartSplit) {
        if (event.repeat) return
        event.preventDefault()
        setDriverPane(state.driverPane === 'primary' ? 'secondary' : 'primary')
        return
      }

      if (event.key === 'ArrowLeft') {
        if (state.replayLoading || state.secondaryLoading) return
        const driverIndex =
          state.chartSplit && state.driverPane === 'secondary'
            ? state.secondaryReplayIndex
            : state.replayIndex
        if (driverIndex <= 0) return

        event.preventDefault()
        stepBackward()
        return
      }

      if (event.key === 'ArrowRight') {
        if (state.replayLoading || state.secondaryLoading) return
        if (state.replayStatus === 'ended') return

        event.preventDefault()
        stepForward()
        return
      }

      if (event.code !== 'Space' && event.key !== ' ') return
      if (event.repeat) return
      if (state.replayLoading || state.secondaryLoading) return

      event.preventDefault()

      if (state.isPlaying) {
        pause()
        return
      }

      if (state.replayStatus === 'ended') return
      play()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode, play, pause, stepForward, stepBackward, setDriverPane])
}
