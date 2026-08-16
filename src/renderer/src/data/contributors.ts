import snapshot from './contributors.json'
import { isBotOrAgent, type ContributorSnapshot } from '@shared/githubContributors'

const avatarModules = import.meta.glob('../assets/contributors/*.{png,jpg,jpeg,webp,gif}', {
  eager: true,
  import: 'default'
}) as Record<string, string>

export type Contributor = {
  login: string
  htmlUrl: string
  avatarSrc: string
}

function resolveAvatar(filename: string): string | undefined {
  const suffix = `/${filename}`
  const key = Object.keys(avatarModules).find((path) => path.endsWith(suffix))
  return key ? avatarModules[key] : undefined
}

export const contributors: Contributor[] = (snapshot as ContributorSnapshot[]).flatMap((row) => {
  if (isBotOrAgent(row)) return []
  const avatarSrc = resolveAvatar(row.avatar)
  if (!avatarSrc) return []
  return [{ login: row.login, htmlUrl: row.htmlUrl, avatarSrc }]
})
