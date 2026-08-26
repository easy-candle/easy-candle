import {
  apiFetchMe,
  apiGooglePoll,
  apiGoogleStart,
  apiLogout
} from '@shared/accountApi'
import type { AccountSession, AuthResult } from '@shared/accountTypes'

const TOKEN_KEY = 'easy-candle:account-token'
const HASH_TOKEN = 'easy-candle-auth'
const SIGNED_OUT: AccountSession = { signedIn: false }
const POLL_MS = 1500
const POLL_TIMEOUT_MS = 5 * 60 * 1000

function apiBaseUrl(): string {
  return __API_BASE_URL__
}

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    // ignore quota / private mode
  }
}

function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

function takeHashToken(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const token = params.get(HASH_TOKEN)
  if (!token) return null
  params.delete(HASH_TOKEN)
  const next = params.toString()
  const url = `${window.location.pathname}${window.location.search}${next ? `#${next}` : ''}`
  window.history.replaceState(null, '', url)
  return token
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sessionFromStore(): Promise<AccountSession> {
  const fromHash = takeHashToken()
  if (fromHash) writeToken(fromHash)
  const token = readToken()
  if (!token) return SIGNED_OUT
  const result = await apiFetchMe(apiBaseUrl(), token)
  if (!result.ok || !result.session.signedIn) {
    clearToken()
    return SIGNED_OUT
  }
  return result.session
}

export async function webAuthSession(): Promise<AccountSession> {
  return sessionFromStore()
}

export async function webAuthGoogleStart(): Promise<AuthResult> {
  const start = await apiGoogleStart(apiBaseUrl(), 'web')
  if (!start.ok) return start
  const popup = window.open(start.url, 'easy-candle-google', 'width=480,height=720')
  if (!popup) {
    window.location.assign(start.url)
    return { ok: false, error: 'Continue in this tab, then return to Easy Candle.' }
  }
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_MS)
    const poll = await apiGooglePoll(apiBaseUrl(), start.pollId)
    if (!poll.ok) return poll
    if (poll.pending) continue
    writeToken(poll.token)
    try {
      popup.close()
    } catch {
      // ignore
    }
    return { ok: true, session: poll.session }
  }
  return { ok: false, error: 'Sign-in timed out. Try again.' }
}

export async function webAuthLogout(): Promise<AuthResult> {
  clearToken()
  void apiLogout(apiBaseUrl())
  return { ok: true, session: SIGNED_OUT }
}

export async function webAuthRefresh(): Promise<AuthResult> {
  const token = readToken()
  if (!token) return { ok: true, session: SIGNED_OUT }
  const result = await apiFetchMe(apiBaseUrl(), token)
  if (!result.ok) return result
  if (!result.session.signedIn) clearToken()
  return result
}
