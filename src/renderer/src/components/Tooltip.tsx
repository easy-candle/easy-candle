import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Kbd from '@/components/Kbd'

type TooltipProps = {
  text?: string
  kbds?: string[]
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
  disabled?: boolean
  className?: string
}

const VIEWPORT_MARGIN = 8
const OPEN_DELAY = 150
const CLOSE_DELAY = 80

export default function Tooltip({
  text,
  kbds = [],
  children,
  side = 'bottom',
  sideOffset = 6,
  disabled = false,
  className = ''
}: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const [visible, setVisible] = useState(false)

  const hasContent = Boolean(text || kbds.length > 0)
  const kbdsKey = kbds.join('|')

  function clearTimers(): void {
    if (openTimer.current != null) {
      window.clearTimeout(openTimer.current)
      openTimer.current = null
    }
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  function scheduleOpen(): void {
    if (disabled || !hasContent) return
    clearTimers()
    openTimer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY)
  }

  function scheduleClose(): void {
    clearTimers()
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY)
  }

  useLayoutEffect(() => {
    if (!open) {
      setVisible(false)
      return
    }

    const trigger = triggerRef.current
    const content = contentRef.current
    if (!trigger || !content) return

    const triggerRect = trigger.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()

    let left: number
    let top: number
    if (side === 'right') {
      left = triggerRect.right + sideOffset
      top = triggerRect.top + triggerRect.height / 2 - contentRect.height / 2
    } else if (side === 'left') {
      left = triggerRect.left - contentRect.width - sideOffset
      top = triggerRect.top + triggerRect.height / 2 - contentRect.height / 2
    } else if (side === 'top') {
      left = triggerRect.left + triggerRect.width / 2 - contentRect.width / 2
      top = triggerRect.top - contentRect.height - sideOffset
    } else {
      left = triggerRect.left + triggerRect.width / 2 - contentRect.width / 2
      top = triggerRect.bottom + sideOffset
    }

    left = Math.min(
      Math.max(left, VIEWPORT_MARGIN),
      window.innerWidth - contentRect.width - VIEWPORT_MARGIN
    )
    top = Math.min(
      Math.max(top, VIEWPORT_MARGIN),
      window.innerHeight - contentRect.height - VIEWPORT_MARGIN
    )

    setPos({ left, top })
    setVisible(true)
  }, [open, side, sideOffset, text, kbdsKey])

  useLayoutEffect(() => clearTimers, [])

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex ${className}`}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocusCapture={scheduleOpen}
        onBlurCapture={scheduleClose}
      >
        {children}
      </span>
      {open &&
        hasContent &&
        createPortal(
          <div
            ref={contentRef}
            role="tooltip"
            style={{ left: pos.left, top: pos.top, visibility: visible ? 'visible' : 'hidden' }}
            className="pointer-events-none fixed z-[60] flex h-6 max-w-[80vw] select-none items-center gap-1 whitespace-nowrap rounded-sm border border-zinc-600/50 bg-white dark:bg-zinc-800 px-1.5 py-1 text-xs text-zinc-100 shadow-lg shadow-black/10"
          >
            {text && <span className="truncate">{text}</span>}
            {kbds.length > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5">
                {kbds.map((key, index) => (
                  <span key={key} className="inline-flex items-center gap-0.5">
                    {index > 0 && <span className="text-zinc-500">·</span>}
                    <Kbd>{key}</Kbd>
                  </span>
                ))}
              </span>
            )}
          </div>,
          document.body
        )}
    </>
  )
}
