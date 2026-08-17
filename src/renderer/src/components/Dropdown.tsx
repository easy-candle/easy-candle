import { useEffect, useRef, useState, type ReactNode } from 'react'

type DropdownProps = {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  children: ReactNode
  align?: 'start' | 'end'
  menuClassName?: string
}

export default function Dropdown({
  trigger,
  children,
  align = 'start',
  menuClassName = ''
}: DropdownProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function toggle(): void {
    setOpen((value) => !value)
  }

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, toggle })}
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-50 mt-1 min-w-[8rem] overflow-hidden rounded border border-zinc-700 bg-zinc-950 py-1 shadow-xl shadow-black/10 ${
            align === 'end' ? 'right-0' : 'left-0'
          } ${menuClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  )
}
