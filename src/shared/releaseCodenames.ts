/**
 * Watcher codenames by major version.
 *
 * v4 is wildcat — Koboyo has no lynx. Splash (and later About) should look up
 * the slug here so a 3.0.0 ship picks owl without rewriting the poster.
 */
export const RELEASE_CODENAMES = {
  2: 'fox',
  3: 'owl',
  4: 'wildcat',
  5: 'hawk',
  6: 'heron',
  7: 'raven'
} as const

export type ReleaseCodenameSlug = (typeof RELEASE_CODENAMES)[keyof typeof RELEASE_CODENAMES]

export function parseSemverMajor(version: string): number | undefined {
  const match = String(version)
    .trim()
    .replace(/^v/i, '')
    .match(/^(\d+)/)
  if (!match) return undefined
  return Number(match[1])
}

function isReleaseCodenameMajor(major: number): major is keyof typeof RELEASE_CODENAMES {
  return Object.prototype.hasOwnProperty.call(RELEASE_CODENAMES, major)
}

export function getReleaseCodename(version: string): ReleaseCodenameSlug | undefined {
  const major = parseSemverMajor(version)
  if (major == null || !isReleaseCodenameMajor(major)) return undefined
  return RELEASE_CODENAMES[major]
}
