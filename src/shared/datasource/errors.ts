export type DataSourceErrorKind =
  'invalid-input' | 'not-found' | 'rate-limit' | 'unavailable' | 'upstream' | 'unknown'

/** Normalized failure across feeds so callers branch on `kind`, not transport details. */
export class DataSourceError extends Error {
  readonly kind: DataSourceErrorKind
  readonly detail?: string

  constructor(kind: DataSourceErrorKind, message: string, detail?: string) {
    super(message)
    this.name = 'DataSourceError'
    this.kind = kind
    if (detail) this.detail = detail
  }
}

export function dataSourceErrorKindFromStatus(status: number): DataSourceErrorKind {
  if (status === 429) return 'rate-limit'
  if (status === 418 || status === 503) return 'unavailable'
  if (status === 404) return 'not-found'
  if (status >= 400 && status < 500) return 'invalid-input'
  return 'upstream'
}

export function toDataSourceError(err: unknown, fallbackMessage?: string): DataSourceError {
  if (err instanceof DataSourceError) return err
  const message = err instanceof Error && err.message ? err.message : fallbackMessage
  return new DataSourceError('unknown', message || 'Data source request failed')
}
