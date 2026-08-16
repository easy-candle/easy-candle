export type ContributorSnapshot = {
  login: string
  htmlUrl: string
  avatar: string
  type?: string
}

const BLOCKED_LOGINS = new Set([
  'allcontributors',
  'codecov',
  'codecov-commenter',
  'copilot',
  'copilot-swe-agent',
  'cursor',
  'cursoragent',
  'dependabot',
  'ghost',
  'github-actions',
  'github-advanced-security',
  'imgbot',
  'renovate',
  'semantic-release-bot',
  'snyk-bot',
  'web-flow'
])

/** True for GitHub Apps, bots, and known coding agents. Keep in sync with scripts/fetch-contributors.mjs. */
export function isBotOrAgent(contributor: { login?: string; type?: string }): boolean {
  const login = contributor.login?.trim() ?? ''
  if (!login) return true

  const type = contributor.type?.trim()
  if (type && type.toLowerCase() !== 'user') return true

  const lower = login.toLowerCase()
  if (BLOCKED_LOGINS.has(lower)) return true
  if (lower.includes('[bot]')) return true
  if (lower.endsWith('-bot') || lower.endsWith('-agent')) return true
  if (lower.includes('dependabot') || lower.includes('renovate')) return true
  if (lower.startsWith('copilot')) return true
  if (lower.startsWith('cursor') && (lower.includes('bot') || lower.includes('agent'))) return true
  return false
}

export function contributorAvatarFilename(login: string, extension: string): string {
  const safe = login.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const ext = extension.startsWith('.') ? extension : `.${extension}`
  return `${safe}${ext}`
}
