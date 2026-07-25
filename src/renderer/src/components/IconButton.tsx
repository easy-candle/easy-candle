import type { MouseEvent, ReactNode } from 'react'

type IconButtonProps = {
  label: string
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  active?: boolean
  tone?: 'default' | 'accent' | 'danger' | 'success'
  type?: 'button' | 'submit'
  children: ReactNode
  className?: string
}

export default function IconButton({
  label,
  onClick,
  disabled = false,
  active = false,
  tone = 'default',
  type = 'button',
  children,
  className = ''
}: IconButtonProps) {
  const toneClass =
    tone === 'accent'
      ? 'enabled:hover:border-amber-500/70 enabled:hover:text-amber-300'
      : tone === 'danger'
        ? 'enabled:hover:border-red-500/60 enabled:hover:text-red-300'
        : tone === 'success'
          ? 'enabled:hover:border-emerald-500/60 enabled:hover:text-emerald-300'
          : 'enabled:hover:border-zinc-500 enabled:hover:text-zinc-100'

  const activeClass = active
    ? tone === 'success'
      ? 'border-emerald-500/70 bg-emerald-950/50 text-emerald-300'
      : tone === 'danger'
        ? 'border-red-500/70 bg-red-950/50 text-red-300'
        : 'border-amber-500/70 bg-amber-950/40 text-amber-300'
    : 'border-zinc-700 bg-zinc-900/80 text-zinc-300'

  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${activeClass} ${toneClass} ${className}`}
    >
      {children}
    </button>
  )
}
