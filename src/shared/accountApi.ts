import type {
  AccountSession,
  AccountUser,
  AuthClient,
  AuthResult,
  GooglePollResult,
  GoogleStartResult,
  Plan,
  RedeemResult
} from './accountTypes'

export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8787'

type ApiUserBody = {
  id?: unknown
  email?: unknown
  name?: unknown
  image?: unknown
}

type ApiMeBody = {
  ok?: boolean
  error?: string
  user?: ApiUserBody
  plan?: unknown
  accessToken?: unknown
  url?: unknown
  pollId?: unknown
  pending?: unknown
  periodEnd?: unknown
  expireDays?: unknown
  subscription?: unknown
}

function parsePlan(value: unknown): Plan | null {
  return value === 'free' || value === 'pro' ? value : null
}

function parseExpireDays(value: unknown): 365 | 186 | 90 | null {
  return value === 365 || value === 186 || value === 90 ? value : null
}

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseSubscriptionPeriodEnd(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  return optionalString((value as { periodEnd?: unknown }).periodEnd)
}

function parseUser(value: ApiUserBody | undefined): AccountUser | null {
  if (!value || typeof value.id !== 'string' || typeof value.email !== 'string') return null
  if (!value.id || !value.email) return null
  return {
    id: value.id,
    email: value.email,
    name: optionalString(value.name),
    image: optionalString(value.image)
  }
}

function sessionFromMe(body: ApiMeBody): AccountSession | null {
  const user = parseUser(body.user)
  const plan = parsePlan(body.plan)
  if (!user || !plan) return null
  return {
    signedIn: true,
    user,
    plan,
    periodEnd: null
  }
}

async function withPeriodEnd(
  baseUrl: string,
  token: string,
  session: AccountSession
): Promise<AccountSession> {
  if (!session.signedIn) return session
  const result = await request(baseUrl, '/v1/billing/subscription', {
    method: 'GET',
    headers: authHeaders(token)
  })
  if ('error' in result) return { ...session, periodEnd: null }
  const { response, body } = result
  if (!response.ok || body.ok === false) return { ...session, periodEnd: null }
  return { ...session, periodEnd: parseSubscriptionPeriodEnd(body.subscription) }
}

async function readJson(response: Response): Promise<ApiMeBody> {
  try {
    return (await response.json()) as ApiMeBody
  } catch {
    return {}
  }
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

async function request(
  baseUrl: string,
  path: string,
  init: RequestInit
): Promise<{ response: Response; body: ApiMeBody } | { error: string }> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  try {
    const response = await fetch(url, init)
    const body = await readJson(response)
    return { response, body }
  } catch {
    return { error: "Can't reach the account service. Check your connection and try again." }
  }
}

function authHeaders(token: string | null, json = false): HeadersInit {
  const headers: Record<string, string> = {}
  if (json) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export async function apiGoogleStart(
  baseUrl: string,
  client: AuthClient
): Promise<GoogleStartResult> {
  const result = await request(baseUrl, '/auth/google/start', {
    method: 'POST',
    headers: authHeaders(null, true),
    body: JSON.stringify({ client })
  })
  if ('error' in result) return fail(result.error)
  const { response, body } = result
  if (!response.ok || body.ok === false) {
    return fail(typeof body.error === 'string' ? body.error : `Sign-in failed (${response.status})`)
  }
  const url = typeof body.url === 'string' ? body.url : ''
  const pollId = typeof body.pollId === 'string' ? body.pollId : ''
  if (!url || !pollId) return fail('Sign-in returned an invalid response')
  return { ok: true, url, pollId }
}

export async function apiGooglePoll(baseUrl: string, pollId: string): Promise<GooglePollResult> {
  const result = await request(baseUrl, `/auth/google/poll/${encodeURIComponent(pollId)}`, {
    method: 'GET'
  })
  if ('error' in result) return fail(result.error)
  const { response, body } = result
  if (!response.ok || body.ok === false) {
    return fail(typeof body.error === 'string' ? body.error : `Sign-in failed (${response.status})`)
  }
  if (body.pending === true) return { ok: true, pending: true }
  const session = sessionFromMe(body)
  const token = typeof body.accessToken === 'string' ? body.accessToken : ''
  if (!session || !token) return fail('Sign-in returned an invalid response')
  return { ok: true, pending: false, session: await withPeriodEnd(baseUrl, token, session), token }
}

export async function apiFetchMe(baseUrl: string, token: string): Promise<AuthResult> {
  const result = await request(baseUrl, '/me', {
    method: 'GET',
    headers: authHeaders(token)
  })
  if ('error' in result) return fail(result.error)
  const { response, body } = result
  if (response.status === 401) {
    return { ok: true, session: { signedIn: false } }
  }
  if (!response.ok || body.ok === false) {
    return fail(typeof body.error === 'string' ? body.error : `Session check failed (${response.status})`)
  }
  const session = sessionFromMe(body)
  if (!session) return fail('Session check returned an invalid response')
  return { ok: true, session: await withPeriodEnd(baseUrl, token, session) }
}

export async function apiRedeemCode(
  baseUrl: string,
  token: string,
  code: string
): Promise<RedeemResult> {
  const result = await request(baseUrl, '/v1/promo/redeem', {
    method: 'POST',
    headers: authHeaders(token, true),
    body: JSON.stringify({ code })
  })
  if ('error' in result) return fail(result.error)
  const { response, body } = result
  if (!response.ok || body.ok === false) {
    return fail(typeof body.error === 'string' ? body.error : `Redeem failed (${response.status})`)
  }
  const plan = parsePlan(body.plan)
  const periodEnd = optionalString(body.periodEnd)
  const expireDays = parseExpireDays(body.expireDays)
  if (plan !== 'pro' || !periodEnd || !expireDays) {
    return fail('Redeem returned an invalid response')
  }
  return { ok: true, plan, periodEnd, expireDays }
}

export async function apiLogout(baseUrl: string): Promise<void> {
  await request(baseUrl, '/auth/logout', { method: 'POST' })
}
