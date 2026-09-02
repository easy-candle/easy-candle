import type { AppStatus, AppStoreInfo } from '@shared/appStatus'
import { semverGte, semverLt } from '@shared/semver'

/**
 * Mandatory-update policy. Pure — Task F wires this to IPC / electron-updater.
 *
 * Task F: `import { evaluateUpdatePolicy, type UpdateChannel } from './updatePolicy'`
 *
 * Rules:
 * - `unsupported` = current < status.minVersion (false if status fetch failed)
 * - GitHub `force` = `mandatory` (latest.yml) OR `unsupported`
 * - Store `blockStore` = unsupported AND client catalog `liveVersion >= minVersion`
 * - Catalog missing / liveVersion still below minVersion → do not block Store users
 */

export type UpdateChannel = 'github' | 'store' | 'dev'

export type EvaluateUpdatePolicyInput = {
  channel: UpdateChannel
  currentVersion: string
  /** GET /status body, or null when the request failed (fail-open). */
  status: AppStatus | null
  /**
   * GitHub `latest.yml` `mandatory` preserved by electron-updater.
   * Ignored for blocking Store users; still folds into `force`.
   */
  mandatory?: boolean
  /**
   * Live Store package version from the client's Display Catalog fetch.
   * Null/omitted = catalog not live (fail-open). Not read from GET /status.
   */
  storeLiveVersion?: string | null
}

export type UpdatePolicyResult = {
  channel: UpdateChannel
  currentVersion: string
  minVersion: string | null
  /** `latest.yml` mandatory flag passed in (false when omitted). */
  mandatory: boolean
  /** Current build is below API minVersion. False when status is missing. */
  unsupported: boolean
  /** GitHub: `mandatory || unsupported`. Store: same as `blockStore`. */
  force: boolean
  /**
   * Full-screen Store lock. Only true when `channel === 'store'`, the build is
   * unsupported, AND catalog `liveVersion >= minVersion` (listing can satisfy the floor).
   * False if the catalog is not live / still below minVersion.
   */
  blockStore: boolean
  storeLiveVersion: string | null
  store: AppStoreInfo | null
}

function optionalVersion(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Evaluate force / unsupported / Store-block for a check-for-updates pass.
 *
 * GitHub: electron-updater `mandatory` plus minVersion floor.
 * Store: never uses latest.yml; block only when the listing already has minVersion.
 * Dev: same math; Task F decides whether to surface `force` locally.
 */
export function evaluateUpdatePolicy(input: EvaluateUpdatePolicyInput): UpdatePolicyResult {
  const channel = input.channel
  const currentVersion = String(input.currentVersion ?? '').trim()
  const status = input.status
  const mandatory = input.mandatory === true
  const minVersion = optionalVersion(status?.minVersion)
  const store = status?.store ?? null

  const storeLiveVersion = optionalVersion(input.storeLiveVersion)

  const unsupported = minVersion != null && currentVersion !== '' && semverLt(currentVersion, minVersion)
  const minLiveOnStore =
    storeLiveVersion != null && minVersion != null && semverGte(storeLiveVersion, minVersion)
  const blockStore = channel === 'store' && unsupported && minLiveOnStore
  const force = channel === 'store' ? blockStore : mandatory || unsupported

  return {
    channel,
    currentVersion,
    minVersion,
    mandatory,
    unsupported,
    force,
    blockStore,
    storeLiveVersion,
    store
  }
}
