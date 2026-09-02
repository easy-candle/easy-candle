import { create } from 'zustand'
import type { AccountSession, AccountUser, AuthResult, Plan, RedeemResult } from '@shared/accountTypes'

type AccountStatus = 'idle' | 'loading'

type AccountState = {
  status: AccountStatus
  error: string | null
  signedIn: boolean
  user: AccountUser | null
  plan: Plan | null
  periodEnd: string | null
  hydrate: () => Promise<void>
  googleSignIn: () => Promise<boolean>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  redeemCode: (code: string) => Promise<RedeemResult>
}

const SIGNED_OUT: AccountSession = { signedIn: false }

function applySession(
  set: (partial: Partial<AccountState>) => void,
  session: AccountSession,
  extra?: Partial<AccountState>
): void {
  if (!session.signedIn) {
    set({
      signedIn: false,
      user: null,
      plan: null,
      periodEnd: null,
      status: 'idle',
      error: extra?.error ?? null,
      ...extra
    })
    return
  }
  set({
    signedIn: true,
    user: session.user,
    plan: session.plan,
    periodEnd: session.periodEnd,
    status: 'idle',
    error: extra?.error ?? null,
    ...extra
  })
}

async function runAuth(
  set: (partial: Partial<AccountState>) => void,
  action: () => Promise<AuthResult>
): Promise<boolean> {
  set({ status: 'loading', error: null })
  const result = await action()
  if (!result.ok) {
    set({ status: 'idle', error: result.error })
    return false
  }
  applySession(set, result.session)
  return true
}

export const useAccountStore = create<AccountState>((set) => ({
  status: 'idle',
  error: null,
  signedIn: false,
  user: null,
  plan: null,
  periodEnd: null,

  hydrate: async () => {
    set({ status: 'loading', error: null })
    try {
      const session = await window.api.authSession()
      applySession(set, session ?? SIGNED_OUT)
    } catch {
      applySession(set, SIGNED_OUT, { error: 'Could not restore the account session' })
    }
  },

  googleSignIn: () => runAuth(set, () => window.api.authGoogleStart()),

  logout: async () => {
    set({ status: 'loading', error: null })
    try {
      const result = await window.api.authLogout()
      applySession(set, result.ok ? result.session : SIGNED_OUT)
    } catch {
      applySession(set, SIGNED_OUT)
    }
  },

  refresh: async () => {
    const result = await window.api.authRefresh()
    if (result.ok) applySession(set, result.session)
  },

  redeemCode: async (code: string): Promise<RedeemResult> => {
    try {
      const result = await window.api.authRedeemCode(code)
      if (result.ok) {
        set((state) => ({
          plan: result.plan,
          periodEnd: result.periodEnd,
          user: state.user ? { ...state.user, earlyAdapter: true } : state.user
        }))
      }
      return result
    } catch {
      return { ok: false, error: "Can't reach the account service. Check your connection and try again." }
    }
  }
}))
