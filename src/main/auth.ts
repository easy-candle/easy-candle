import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain, safeStorage, shell } from 'electron'
import { apiFetchMe, apiGooglePoll, apiGoogleStart, apiLogout } from '@shared/accountApi'
import type { AccountSession, AuthResult } from '@shared/accountTypes'
import { IPC_CHANNELS } from '@shared/ipc/channels'

const SIGNED_OUT: AccountSession = { signedIn: false }
const POLL_MS = 1500
const POLL_TIMEOUT_MS = 5 * 60 * 1000

function apiBaseUrl(): string {
  return __API_BASE_URL__
}

function tokenFile(): string {
  return join(app.getPath('userData'), 'account-token.json')
}

type StoredToken = { enc: boolean; data: string }

function readStoredToken(): string | null {
  try {
    const parsed = JSON.parse(readFileSync(tokenFile(), 'utf8')) as StoredToken
    if (!parsed || typeof parsed.data !== 'string' || !parsed.data) return null
    if (!parsed.enc) return parsed.data
    if (!safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(Buffer.from(parsed.data, 'base64'))
  } catch {
    return null
  }
}

function writeStoredToken(token: string): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  const canEncrypt = safeStorage.isEncryptionAvailable()
  const payload: StoredToken = canEncrypt
    ? { enc: true, data: safeStorage.encryptString(token).toString('base64') }
    : { enc: false, data: token }
  writeFileSync(tokenFile(), JSON.stringify(payload), 'utf8')
}

function clearStoredToken(): void {
  try {
    rmSync(tokenFile(), { force: true })
  } catch {
    // ignore
  }
}

async function sessionFromStore(): Promise<AccountSession> {
  const token = readStoredToken()
  if (!token) return SIGNED_OUT
  const result = await apiFetchMe(apiBaseUrl(), token)
  if (!result.ok) return SIGNED_OUT
  if (!result.session.signedIn) {
    clearStoredToken()
    return SIGNED_OUT
  }
  return result.session
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function registerAuthIpc(): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_SESSION, async (): Promise<AccountSession> => {
    return sessionFromStore()
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_GOOGLE_START, async (): Promise<AuthResult> => {
    const start = await apiGoogleStart(apiBaseUrl(), 'desktop')
    if (!start.ok) return start
    await shell.openExternal(start.url)
    const deadline = Date.now() + POLL_TIMEOUT_MS
    while (Date.now() < deadline) {
      await sleep(POLL_MS)
      const poll = await apiGooglePoll(apiBaseUrl(), start.pollId)
      if (!poll.ok) return poll
      if (poll.pending) continue
      writeStoredToken(poll.token)
      return { ok: true, session: poll.session }
    }
    return { ok: false, error: 'Sign-in timed out. Return to the app and try again.' }
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (): Promise<AuthResult> => {
    clearStoredToken()
    void apiLogout(apiBaseUrl())
    return { ok: true, session: SIGNED_OUT }
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_REFRESH, async (): Promise<AuthResult> => {
    const token = readStoredToken()
    if (!token) return { ok: true, session: SIGNED_OUT }
    const result = await apiFetchMe(apiBaseUrl(), token)
    if (!result.ok) return result
    if (!result.session.signedIn) clearStoredToken()
    return result
  })
}
