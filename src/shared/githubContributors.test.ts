import { describe, expect, it } from 'vitest'
import { contributorAvatarFilename, isBotOrAgent } from './githubContributors'

describe('isBotOrAgent', () => {
  it('keeps human users', () => {
    expect(isBotOrAgent({ login: 'octocat', type: 'User' })).toBe(false)
    expect(isBotOrAgent({ login: 'easy-candle' })).toBe(false)
  })

  it('drops missing logins and non-user types', () => {
    expect(isBotOrAgent({ login: '', type: 'User' })).toBe(true)
    expect(isBotOrAgent({ type: 'User' })).toBe(true)
    expect(isBotOrAgent({ login: 'easy-candle', type: 'Bot' })).toBe(true)
    expect(isBotOrAgent({ login: 'easy-candle', type: 'Organization' })).toBe(true)
  })

  it('drops GitHub Apps, bots, and known agents', () => {
    expect(isBotOrAgent({ login: 'dependabot[bot]', type: 'Bot' })).toBe(true)
    expect(isBotOrAgent({ login: 'renovate[bot]', type: 'User' })).toBe(true)
    expect(isBotOrAgent({ login: 'github-actions[bot]' })).toBe(true)
    expect(isBotOrAgent({ login: 'copilot-swe-agent' })).toBe(true)
    expect(isBotOrAgent({ login: 'Copilot', type: 'User' })).toBe(true)
    expect(isBotOrAgent({ login: 'cursor[bot]' })).toBe(true)
    expect(isBotOrAgent({ login: 'imgbot-bot' })).toBe(true)
    expect(isBotOrAgent({ login: 'web-flow', type: 'User' })).toBe(true)
  })
})

describe('contributorAvatarFilename', () => {
  it('keeps a safe filename', () => {
    expect(contributorAvatarFilename('octocat', 'jpg')).toBe('octocat.jpg')
    expect(contributorAvatarFilename('foo[bot]', '.png')).toBe('foo_bot_.png')
  })
})
