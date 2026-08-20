import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { GripVertical, Minus, X } from 'lucide-react'
import { clampPanelPos, type PanelPos } from '@/store/uiLayoutStore'

type FloatingPanelProps = {
  title?: string
  minimized?: boolean
  minimizedLabel?: string
  pos: PanelPos | null
  onPosChange: (pos: PanelPos) => void
  onMinimizedChange?: (minimized: boolean) => void
  /** When set, show a close control that calls this (e.g. exit fullscreen-only panels). */
  onClose?: () => void
  /** Extra actions rendered in the header (e.g. custom icon buttons). */
  headerActions?: ReactNode
  /** Prefer bottom-center when pos is null; otherwise top-left / top-right. */
  defaultPlacement?: 'bottom-center' | 'top-left' | 'top-right'
  className?: string
  children: ReactNode
}

export default function FloatingPanel({
  title,
  minimized = false,
  minimizedLabel,
  pos,
  onPosChange,
  onMinimizedChange,
  onClose,
  headerActions,
  defaultPlacement = 'bottom-center',
  className = '',
  children
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const resolveDefaultPos = useCallback(
    (container: DOMRect, panel: DOMRect): PanelPos => {
      if (defaultPlacement === 'top-left') {
        return clampPanelPos({ x: 12, y: 12 }, container.width, container.height, panel.width, panel.height)
      }
      if (defaultPlacement === 'top-right') {
        // Leave room for the fullscreen exit control (top-right).
        return clampPanelPos(
          { x: Math.round(container.width - panel.width - 12), y: 48 },
          container.width,
          container.height,
          panel.width,
          panel.height
        )
      }
      return clampPanelPos(
        {
          x: Math.round((container.width - panel.width) / 2),
          y: Math.round(container.height - panel.height - 16)
        },
        container.width,
        container.height,
        panel.width,
        panel.height
      )
    },
    [defaultPlacement]
  )

  const clampToParent = useCallback(
    (next: PanelPos): PanelPos | null => {
      const el = panelRef.current
      const parent = el?.offsetParent as HTMLElement | null
      if (!el || !parent) return null
      const parentRect = parent.getBoundingClientRect()
      const panelRect = el.getBoundingClientRect()
      return clampPanelPos(next, parentRect.width, parentRect.height, panelRect.width, panelRect.height)
    },
    []
  )

  useLayoutEffect(() => {
    const el = panelRef.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return

    const parentRect = parent.getBoundingClientRect()
    const panelRect = el.getBoundingClientRect()
    if (panelRect.width <= 0 || panelRect.height <= 0) return

    const next =
      pos == null
        ? resolveDefaultPos(parentRect, panelRect)
        : clampPanelPos(pos, parentRect.width, parentRect.height, panelRect.width, panelRect.height)

    if (pos == null || next.x !== pos.x || next.y !== pos.y) {
      onPosChange(next)
    }
  }, [pos, minimized, resolveDefaultPos, onPosChange])

  useEffect(() => {
    const el = panelRef.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return

    const reclamp = (): void => {
      const current = pos
      if (current == null) return
      const parentRect = parent.getBoundingClientRect()
      const panelRect = el.getBoundingClientRect()
      if (panelRect.width <= 0 || panelRect.height <= 0) return
      const next = clampPanelPos(
        current,
        parentRect.width,
        parentRect.height,
        panelRect.width,
        panelRect.height
      )
      if (next.x !== current.x || next.y !== current.y) onPosChange(next)
    }

    const observer = new ResizeObserver(reclamp)
    observer.observe(parent)
    observer.observe(el)
    return () => observer.disconnect()
  }, [pos, onPosChange])

  useEffect(() => {
    if (!dragging) return undefined

    function onPointerMove(event: PointerEvent): void {
      if (!dragOffset.current) return
      const parent = panelRef.current?.offsetParent as HTMLElement | null
      if (!parent) return
      const parentRect = parent.getBoundingClientRect()
      const raw: PanelPos = {
        x: event.clientX - parentRect.left - dragOffset.current.x,
        y: event.clientY - parentRect.top - dragOffset.current.y
      }
      const clamped = clampToParent(raw)
      if (clamped) onPosChange(clamped)
    }

    function onPointerUp(): void {
      dragOffset.current = null
      setDragging(false)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [dragging, clampToParent, onPosChange])

  function onDragHandlePointerDown(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return
    const el = panelRef.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return
    const parentRect = parent.getBoundingClientRect()
    const panelRect = el.getBoundingClientRect()
    dragOffset.current = {
      x: event.clientX - panelRect.left,
      y: event.clientY - panelRect.top
    }
    // Ensure we have a concrete pos before drag
    if (pos == null) {
      onPosChange({
        x: panelRect.left - parentRect.left,
        y: panelRect.top - parentRect.top
      })
    }
    setDragging(true)
    event.preventDefault()
  }

  const style =
    pos != null
      ? { left: pos.x, top: pos.y }
      : defaultPlacement === 'bottom-center'
        ? { left: '50%', bottom: 16, top: 'auto', transform: 'translateX(-50%)' }
        : defaultPlacement === 'top-right'
          ? { right: 12, top: 48, left: 'auto' }
          : { left: 12, top: 12 }

  if (minimized) {
    return (
      <div
        ref={panelRef}
        className={`pointer-events-auto absolute z-20 ${className}`}
        style={style}
      >
        <button
          type="button"
          onClick={() => onMinimizedChange?.(false)}
          className="inline-flex h-8 items-center gap-1.5 rounded border border-amber-500/40 bg-zinc-950/95 px-2.5 text-xs font-medium text-amber-300 shadow-lg shadow-black/40 hover:border-amber-400/70 hover:text-amber-200"
        >
          <GripVertical className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
          {minimizedLabel ?? title ?? 'Controls'}
        </button>
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      className={`pointer-events-auto absolute z-20 max-w-[min(100%,42rem)] rounded border border-zinc-700/90 bg-zinc-950/95 shadow-lg dark:shadow-black/50 backdrop-blur-sm ${className}`}
      style={style}
    >
      <div className="flex items-center gap-1 border-b border-zinc-800/90 px-1.5 py-1">
        <button
          type="button"
          aria-label="Drag panel"
          title="Drag"
          onPointerDown={onDragHandlePointerDown}
          className={`inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300 active:cursor-grabbing ${
            dragging ? 'cursor-grabbing text-zinc-300' : ''
          }`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {title && (
          <span className="min-w-0 flex-1 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            {title}
          </span>
        )}
        {!title && <span className="min-w-0 flex-1" />}
        {headerActions && (
          <div className="flex shrink-0 items-center gap-0.5">{headerActions}</div>
        )}
        {onMinimizedChange && (
          <button
            type="button"
            aria-label="Minimize panel"
            title="Minimize"
            onClick={() => onMinimizedChange(true)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        )}
        {onClose && (
          <button
            type="button"
            aria-label="Close panel"
            title="Close"
            onClick={onClose}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="px-2 py-2">{children}</div>
    </div>
  )
}
