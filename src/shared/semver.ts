/**
 * Small numeric semver helpers for update policy. No `semver` package.
 *
 * Task F: `import { semverLt, compareSemver } from '@shared/semver'`
 */

/** Strip a leading `v`, build metadata, and prerelease; split into numeric parts. */
export function parseSemverParts(version: string): number[] {
  const cleaned = String(version ?? '')
    .trim()
    .replace(/^v/i, '')
    .split('+')[0]
    .split('-')[0]
  if (!cleaned) return []
  return cleaned.split('.').map((part) => {
    const n = Number.parseInt(part, 10)
    return Number.isFinite(n) ? n : 0
  })
}

/** -1 if `a < b`, 0 if equal, 1 if `a > b`. Missing parts compare as 0 (`2.12.1` === `2.12.1.0`). */
export function compareSemver(a: string, b: string): number {
  const left = parseSemverParts(a)
  const right = parseSemverParts(b)
  const len = Math.max(left.length, right.length)
  for (let i = 0; i < len; i++) {
    const da = left[i] ?? 0
    const db = right[i] ?? 0
    if (da < db) return -1
    if (da > db) return 1
  }
  return 0
}

export function semverLt(a: string, b: string): boolean {
  return compareSemver(a, b) < 0
}

export function semverGt(a: string, b: string): boolean {
  return compareSemver(a, b) > 0
}

export function semverEq(a: string, b: string): boolean {
  return compareSemver(a, b) === 0
}

export function semverGte(a: string, b: string): boolean {
  return compareSemver(a, b) >= 0
}

export function semverLte(a: string, b: string): boolean {
  return compareSemver(a, b) <= 0
}
