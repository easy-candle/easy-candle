import { useEffect } from 'react'
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
 */
export function useUiHotkeys(): void {
  const toggleChartFullscreen = useUiLayoutStore((s) => s.toggleChartFullscreen)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.repeat) return

      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        toggleChartFullscreen()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleChartFullscreen])
}
