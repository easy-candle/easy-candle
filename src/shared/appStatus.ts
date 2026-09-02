import { DEFAULT_API_BASE_URL } from './accountApi'

/**
 * GET /status types and fetch. Public, no auth. Fail-open: never throws.
 *
 * Task F: `import { apiFetchStatus, type AppStatus } from '@shared/appStatus'`
 * Call `apiFetchStatus()` in main (uses `__API_BASE_URL__`) or pass an override base URL.
 */

/** Store listing from GET /status. Catalog `liveVersion` is fetched by the client, not this payload. */
export type AppStoreInfo = {
  productId: string
  url: string
  webUrl: string
  liveVersion?: string
}

/** Successful GET /status JSON. */
export type AppStatus = {
  ok: true
  minVersion: string
  store: AppStoreInfo
}

export type AppStatusResult = AppStatus | { ok: false; error: string }

const FETCH_TIMEOUT_MS = 10_000

function resolveApiBase(baseUrl?: string): string {
  const fromArg = baseUrl?.trim()
  if (fromArg) return fromArg.replace(/\/$/, '')
  const fromCompile = typeof __API_BASE_URL__ !== 'undefined' ? String(__API_BASE_URL__).trim() : ''
  const raw = fromCompile || DEFAULT_API_BASE_URL
  return raw.replace(/\/$/, '')
}

/** `{apiBase}/status` — same base URL the main process uses for account API calls. */
export function apiStatusUrl(baseUrl?: string): string {
  return `${resolveApiBase(baseUrl)}/status`
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function parseStore(value: unknown): AppStoreInfo | null {
  if (!value || typeof value !== 'object') return null
  const body = value as Record<string, unknown>
  const productId = optionalString(body.productId)
  const url = optionalString(body.url)
  const webUrl = optionalString(body.webUrl)
  if (!productId || !url || !webUrl) return null
  const liveVersion = optionalString(body.liveVersion)
  const store: AppStoreInfo = { productId, url, webUrl }
  if (liveVersion) store.liveVersion = liveVersion
  return store
}

function parseStatus(value: unknown): AppStatus | null {
  if (!value || typeof value !== 'object') return null
  const body = value as Record<string, unknown>
  if (body.ok !== true) return null
  const minVersion = optionalString(body.minVersion)
  const store = parseStore(body.store)
  if (!minVersion || !store) return null
  return { ok: true, minVersion, store }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

/**
 * GET `{apiBase}/status`. Returns `{ ok: false, error }` on network/parse failure
 * (fail-open — callers must not treat that as unsupported / do not throw).
 */
export async function apiFetchStatus(baseUrl?: string): Promise<AppStatusResult> {
  const url = apiStatusUrl(baseUrl)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    const body = await readJson(response)
    if (!response.ok) {
      const err =
        body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
          ? (body as { error: string }).error
          : `Status check failed (${response.status})`
      return fail(err)
    }
    const status = parseStatus(body)
    if (!status) return fail('Status check returned an invalid response')
    return status
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail(message || "Can't reach the account service. Check your connection and try again.")
  }
}
