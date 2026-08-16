/**
 * Snapshot GitHub contributors (avatars + profile links) for the About dialog.
 * Filters bots/agents. Keep isBotOrAgent in sync with src/shared/githubContributors.ts.
 *
 * Usage: yarn fetch-contributors
 * Optional: GITHUB_TOKEN, CONTRIBUTORS_REPO=owner/repo
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const JSON_PATH = join(ROOT, 'src/renderer/src/data/contributors.json')
const AVATAR_DIR = join(ROOT, 'src/renderer/src/assets/contributors')
const AVATAR_SIZE = 80
const USER_AGENT = 'easy-candle-electron (contributor snapshot)'

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

function isBotOrAgent(contributor) {
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
  if (lower.startsWith('cursor') && (lower.includes('bot') || lower.includes('agent'))) {
    return true
  }
  return false
}

function contributorAvatarFilename(login, extension) {
  const safe = login.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const ext = extension.startsWith('.') ? extension : `.${extension}`
  return `${safe}${ext}`
}

function parseRepo(url) {
  const match = String(url).match(/github\.com[:/]([^/]+)\/([^/.]+)/i)
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

async function resolveRepo() {
  const fromEnv = process.env.CONTRIBUTORS_REPO?.trim()
  if (fromEnv) {
    const [owner, repo] = fromEnv.split('/')
    if (owner && repo) return { owner, repo }
  }

  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  const parsed = parseRepo(pkg.repository?.url ?? pkg.homepage)
  if (!parsed) {
    throw new Error('Cannot parse GitHub owner/repo from package.json')
  }
  return parsed
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': USER_AGENT
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function nextLink(linkHeader) {
  if (!linkHeader) return null
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/)
    if (match) return match[1]
  }
  return null
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: githubHeaders() })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)
  }
  return { data: await response.json(), response }
}

async function listContributors(owner, repo) {
  const people = []
  let url = `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=100&anon=false`

  while (url) {
    const { data, response } = await fetchJson(url)
    if (!Array.isArray(data)) {
      throw new Error('Unexpected contributors response')
    }
    people.push(...data)
    url = nextLink(response.headers.get('link'))
  }

  return people
}

function extensionFromContentType(contentType) {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase()
  if (type === 'image/png') return '.png'
  if (type === 'image/webp') return '.webp'
  if (type === 'image/gif') return '.gif'
  return '.jpg'
}

function withAvatarSize(avatarUrl) {
  const url = new URL(avatarUrl)
  url.searchParams.set('s', String(AVATAR_SIZE))
  return url.toString()
}

async function downloadAvatar(avatarUrl) {
  const response = await fetch(withAvatarSize(avatarUrl), { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) {
    throw new Error(`Avatar ${response.status} ${response.statusText}`)
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    ext: extensionFromContentType(response.headers.get('content-type'))
  }
}

async function clearAvatars() {
  await mkdir(AVATAR_DIR, { recursive: true })
  for (const name of await readdir(AVATAR_DIR)) {
    if (name === '.gitkeep') continue
    await rm(join(AVATAR_DIR, name), { force: true })
  }
}

async function snapshotExists() {
  try {
    await readFile(JSON_PATH)
    return true
  } catch {
    return false
  }
}

async function main() {
  const { owner, repo } = await resolveRepo()
  console.log(`Fetching contributors for ${owner}/${repo}`)

  let raw
  try {
    raw = await listContributors(owner, repo)
  } catch (error) {
    if (await snapshotExists()) {
      console.warn(`Fetch failed, keeping existing snapshot: ${error.message}`)
      return
    }
    throw error
  }

  const humans = raw.filter((row) => !isBotOrAgent(row))
  await clearAvatars()

  const snapshot = []
  for (const row of humans) {
    try {
      const { buffer, ext } = await downloadAvatar(row.avatar_url)
      const filename = contributorAvatarFilename(row.login, ext)
      await writeFile(join(AVATAR_DIR, filename), buffer)
      snapshot.push({
        login: row.login,
        htmlUrl: row.html_url,
        avatar: filename,
        type: row.type ?? 'User'
      })
    } catch (error) {
      console.warn(`Skipping ${row.login}: ${error.message}`)
    }
  }

  await mkdir(dirname(JSON_PATH), { recursive: true })
  await writeFile(JSON_PATH, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(`Wrote ${snapshot.length} contributor(s) to ${JSON_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
