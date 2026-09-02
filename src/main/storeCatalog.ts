import { compareSemver } from '@shared/semver'

/**
 * Microsoft Display Catalog live package version for the Store listing.
 * Fail-open: network/parse errors return null (do not block Store users).
 *
 * Task F: `import { fetchStoreLiveVersion, STORE_PRODUCT_ID } from './storeCatalog'`
 */

export const STORE_PRODUCT_ID = '9N91GNR9SJ14'
export const STORE_CATALOG_MARKET = 'US'
export const STORE_CATALOG_LANGUAGES = 'en-us'

const FETCH_TIMEOUT_MS = 10_000
const CACHE_MS = 15 * 60 * 1000

const VERSION_SEGMENT = /^\d+(?:\.\d+)+$/

type CacheEntry = { at: number; liveVersion: string }

const cacheByProduct = new Map<string, CacheEntry>()

export function buildStoreCatalogUrl(productId: string = STORE_PRODUCT_ID): string {
  const id = encodeURIComponent(productId.trim() || STORE_PRODUCT_ID)
  return `https://displaycatalog.mp.microsoft.com/v7.0/products/${id}?market=${STORE_CATALOG_MARKET}&languages=${STORE_CATALOG_LANGUAGES}&fieldsTemplate=Details`
}

/**
 * Store packages are 4-part (`2.12.1.0`). Drop trailing `.0` after the first three
 * parts so they compare/display as app semver (`2.12.1`). Non-zero revision is kept.
 */
export function normalizeStoreVersion(version: string): string {
  const cleaned = String(version ?? '')
    .trim()
    .replace(/^v/i, '')
    .split('+')[0]
    .split('-')[0]
  if (!cleaned) return ''
  const parts = cleaned.split('.').map((part) => {
    const n = Number.parseInt(part, 10)
    return Number.isFinite(n) ? n : 0
  })
  while (parts.length > 3 && parts[parts.length - 1] === 0) {
    parts.pop()
  }
  return parts.join('.')
}

function versionFromPackageFullName(fullName: unknown): string | null {
  if (typeof fullName !== 'string' || !fullName) return null
  const segments = fullName.split('_')
  const version = segments[1]
  if (!version || !VERSION_SEGMENT.test(version)) return null
  return version
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function collectFromPackages(packages: unknown, into: string[]): void {
  if (!Array.isArray(packages)) return
  for (const pkg of packages) {
    const rec = asRecord(pkg)
    if (!rec) continue
    const fromName = versionFromPackageFullName(rec.PackageFullName)
    if (fromName) into.push(fromName)
  }
}

function collectFromSkuAvailabilities(skuAvails: unknown, into: string[], trials: string[]): void {
  if (!Array.isArray(skuAvails)) return
  for (const avail of skuAvails) {
    const rec = asRecord(avail)
    const sku = asRecord(rec?.Sku)
    const props = asRecord(sku?.Properties)
    if (!props) continue
    const target = props.IsTrial === true ? trials : into
    collectFromPackages(props.Packages, target)
  }
}

function productRecords(catalog: unknown): Record<string, unknown>[] {
  const root = asRecord(catalog)
  if (!root) return []
  if (Array.isArray(root.Products)) {
    return root.Products.map(asRecord).filter((p): p is Record<string, unknown> => p != null)
  }
  const single = asRecord(root.Product)
  return single ? [single] : []
}

function pickMaxNormalized(versions: string[]): string | null {
  let best: string | null = null
  for (const raw of versions) {
    const normalized = normalizeStoreVersion(raw)
    if (!normalized) continue
    if (best == null || compareSemver(normalized, best) > 0) best = normalized
  }
  return best
}

function collectAnyPackageFullName(value: unknown, into: string[]): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectAnyPackageFullName(item, into)
    return
  }
  const rec = value as Record<string, unknown>
  const fromName = versionFromPackageFullName(rec.PackageFullName)
  if (fromName) into.push(fromName)
  for (const nested of Object.values(rec)) {
    if (nested && typeof nested === 'object') collectAnyPackageFullName(nested, into)
  }
}

/** Extract the newest live package version from Display Catalog Details JSON (`PackageFullName`). */
export function extractStoreLiveVersion(catalog: unknown): string | null {
  const paid: string[] = []
  const trial: string[] = []
  for (const product of productRecords(catalog)) {
    collectFromSkuAvailabilities(product.DisplaySkuAvailabilities, paid, trial)
  }
  const fromSku = pickMaxNormalized(paid) ?? pickMaxNormalized(trial)
  if (fromSku) return fromSku
  const any: string[] = []
  collectAnyPackageFullName(catalog, any)
  return pickMaxNormalized(any)
}

export type StoreCatalogResult =
  | { ok: true; liveVersion: string }
  | { ok: false; error: string; liveVersion: null }

/**
 * Fetch the live Store package version. Returns null on any failure (fail-open).
 * Successful lookups are cached for 15 minutes.
 */
export async function fetchStoreLiveVersion(
  productId: string = STORE_PRODUCT_ID
): Promise<string | null> {
  const result = await fetchStoreCatalog(productId)
  return result.liveVersion
}

export async function fetchStoreCatalog(
  productId: string = STORE_PRODUCT_ID
): Promise<StoreCatalogResult> {
  const id = productId.trim() || STORE_PRODUCT_ID
  const cached = cacheByProduct.get(id)
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { ok: true, liveVersion: cached.liveVersion }
  }

  try {
    const response = await fetch(buildStoreCatalogUrl(id), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
    if (!response.ok) {
      return { ok: false, error: `Display Catalog failed (${response.status})`, liveVersion: null }
    }
    const body: unknown = await response.json()
    const liveVersion = extractStoreLiveVersion(body)
    if (!liveVersion) {
      return { ok: false, error: 'Display Catalog returned no package version', liveVersion: null }
    }
    cacheByProduct.set(id, { at: Date.now(), liveVersion })
    return { ok: true, liveVersion }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message || 'Display Catalog unreachable', liveVersion: null }
  }
}
