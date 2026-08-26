import { useState } from 'react'
import type { AccountUser } from '@shared/accountTypes'

function initialsFor(user: AccountUser): string {
  const source = user.name?.trim() || user.email.trim()
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  const letters = (parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')
  return letters.toUpperCase()
}

export default function UserAvatar({
  user,
  size = 22,
  className = ''
}: {
  user: AccountUser
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(user.image) && !failed

  if (showImage && user.image) {
    return (
      <img
        src={user.image}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-amber-800/90 font-semibold text-amber-50 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
    >
      {initialsFor(user)}
    </span>
  )
}

export function displayName(user: AccountUser): string {
  return user.name?.trim() || user.email.split('@')[0] || user.email
}
