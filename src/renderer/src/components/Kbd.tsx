import type { ReactNode } from 'react'

type KbdProps = {
  children: ReactNode
}

export default function Kbd({ children }: KbdProps) {
  return (
    <kbd className="inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-sm border border-zinc-500/50 bg-zinc-900 px-1 text-[10px] font-medium uppercase leading-none tracking-wide text-zinc-300">
      {children}
    </kbd>
  )
}
