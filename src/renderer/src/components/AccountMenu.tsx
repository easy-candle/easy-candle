import { User } from 'lucide-react'
import Dropdown from '@/components/Dropdown'
import EarlyAdapterBadge from '@/components/EarlyAdapterBadge'
import UserAvatar, { displayName } from '@/components/UserAvatar'
import { useAccountStore } from '@/store/accountStore'
import { useUiLayoutStore } from '@/store/uiLayoutStore'

export default function AccountMenu() {
  const signedIn = useAccountStore((s) => s.signedIn)
  const user = useAccountStore((s) => s.user)
  const plan = useAccountStore((s) => s.plan)
  const status = useAccountStore((s) => s.status)
  const logout = useAccountStore((s) => s.logout)
  const setAccountDialogOpen = useUiLayoutStore((s) => s.setAccountDialogOpen)
  const setRedeemDialogOpen = useUiLayoutStore((s) => s.setRedeemDialogOpen)
  const busy = status === 'loading'

  if (!signedIn || !user) {
    return (
      <button
        type="button"
        onClick={() => setAccountDialogOpen(true)}
        className="inline-flex h-full items-center gap-1.5 px-2.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100"
      >
        <User className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        <span>Sign in</span>
      </button>
    )
  }

  return (
    <Dropdown
      align="end"
      menuClassName="w-64 py-0"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-label={`${displayName(user)} account`}
          aria-expanded={open}
          onClick={toggle}
          className="inline-flex h-full max-w-[18rem] items-center gap-2 px-2.5 text-xs text-zinc-200 transition-colors hover:bg-zinc-800/60 hover:text-zinc-100"
        >
          <UserAvatar user={user} size={22} />
          <span className="min-w-0 truncate">{displayName(user)}</span>
          {user.earlyAdapter ? <EarlyAdapterBadge /> : null}
          {plan === 'pro' && !user.earlyAdapter ? (
            <span className="shrink-0 rounded bg-amber-950/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-200">
              Pro
            </span>
          ) : null}
        </button>
      )}
    >
      {({ close }) => (
        <div className="p-1">
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <UserAvatar user={user} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                  {displayName(user)}
                </p>
                {user.earlyAdapter ? <EarlyAdapterBadge /> : null}
              </div>
              <p className="truncate text-[11px] text-zinc-500">{user.email}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-600">
                {plan === 'pro' ? 'Pro' : 'Free account'}
              </p>
            </div>
          </div>
          <div className="border-t border-zinc-800 py-1">
            <button
              type="button"
              onClick={() => {
                close()
                setAccountDialogOpen(true)
              }}
              className="flex w-full px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Account
            </button>
            {!user.earlyAdapter ? (
              <button
                type="button"
                onClick={() => {
                  close()
                  setRedeemDialogOpen(true)
                }}
                className="flex w-full px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              >
                Early Adapters Redeem
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                close()
                void logout()
              }}
              className="flex w-full px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </Dropdown>
  )
}
