export type Plan = 'free' | 'pro'

export type AccountUser = {
  id: string
  email: string
  name: string | null
  image: string | null
}

export type AccountSession =
  | { signedIn: false }
  | {
      signedIn: true
      user: AccountUser
      plan: Plan
    }

export type AuthResult = { ok: true; session: AccountSession } | { ok: false; error: string }

export type AuthClient = 'desktop' | 'web'

export type GoogleStartResult =
  | { ok: true; url: string; pollId: string }
  | { ok: false; error: string }

export type GooglePollResult =
  | { ok: true; pending: true }
  | { ok: true; pending: false; session: AccountSession; token: string }
  | { ok: false; error: string }
