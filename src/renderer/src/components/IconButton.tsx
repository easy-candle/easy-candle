import type { MouseEvent, ReactNode } from 'react'
import Tooltip from '@/components/Tooltip'

type IconButtonProps = {
  tooltip: string
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  active?: boolean
  tone?: 'default' | 'accent' | 'danger' | 'success'
  type?: 'button' | 'submit'
  children: ReactNode
  className?: string
  /** Keyboard shortcut(s) shown as <kbd> in the tooltip. */
  shortcut?: string[]
  /** Tooltip placement relative to the button. Defaults to 'bottom'. */
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
  /** ghost = borderless hover-fill, used by the drawing rail. */
  variant?: 'default' | 'ghost'
}

export default function IconButton({
  tooltip,
  onClick,
  disabled = false,
  active = false,
  tone = 'default',
  type = 'button',
  children,
  className = '',
  shortcut,
  tooltipSide = 'bottom',
  variant = 'default'
}: IconButtonProps) {
  const ghost = variant === 'ghost'

  const toneClass = ghost
    ? tone === 'danger'
      ? 'enabled:hover:bg-red-950/70 enabled:hover:text-red-300'
      : 'enabled:hover:bg-zinc-800 enabled:hover:text-zinc-100'
    : tone === 'accent'
      ? 'enabled:hover:border-amber-500/70 enabled:hover:text-amber-300'
      : tone === 'danger'
        ? 'enabled:hover:border-red-500/60 enabled:hover:text-red-300'
        : tone === 'success'
          ? 'enabled:hover:border-emerald-500/60 enabled:hover:text-emerald-300'
          : 'enabled:hover:border-zinc-500 enabled:hover:text-zinc-100'

  const activeClass = ghost
    ? active
      ? tone === 'danger'
        ? 'bg-red-950/70 text-red-300'
        : 'bg-zinc-800 text-amber-300'
      : 'bg-transparent text-zinc-400'
    : active
      ? tone === 'success'
        ? 'border-emerald-500/70 bg-emerald-950/50 text-emerald-300'
        : tone === 'danger'
          ? 'border-red-500/70 bg-red-950/50 text-red-300'
          : 'border-amber-500/70 bg-amber-950/40 text-amber-300'
      : 'border-zinc-700 bg-zinc-900/80 text-zinc-300'

  const chrome = ghost
    ? 'rounded border-0'
    : 'rounded border'

  return (
    <Tooltip text={tooltip} kbds={shortcut} side={tooltipSide}>
      <button
        type={type}
        aria-label={tooltip}
        disabled={disabled}
        onClick={onClick}
        className={`inline-flex shrink-0 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${ghost ? 'h-9 w-9' : 'h-8 w-8'} ${chrome} ${activeClass} ${toneClass} ${className}`}
      >
        {children}
      </button>
    </Tooltip>
  )
}
