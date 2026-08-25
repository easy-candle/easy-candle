import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Config shared by `electron.vite.config.ts`, `vite.config.ts` and `vitest.config.ts`.
 *
 * `rootDir` is passed in by each caller (its own `__dirname`) instead of being
 * derived here, because these helpers are inlined into the bundled config and
 * cannot rely on their own module location.
 */

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8787'

/** Read `version` from package.json at build time. */
export function readAppVersion(rootDir: string): string {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as {
    version: string
  }
  return pkg.version
}

export function readApiBaseUrl(): string {
  const fromEnv = process.env.EASY_CANDLE_API_URL?.trim()
  return fromEnv || DEFAULT_API_BASE_URL
}

function shouldLoadPro(rootDir: string): boolean {
  if (process.env.EASY_CANDLE_PRO === '0') return false
  if (process.env.EASY_CANDLE_PRO === '1') return true
  return existsSync(resolve(rootDir, '../easy-candle-pro/src/index.ts'))
}

/** Compile-time constants; must stay in sync with `src/renderer/src/env.d.ts`. */
export function appDefine(rootDir: string): Record<string, string> {
  return {
    __APP_VERSION__: JSON.stringify(readAppVersion(rootDir)),
    __API_BASE_URL__: JSON.stringify(readApiBaseUrl())
  }
}

/**
 * TypeScript always maps `@easy-candle/pro` to the community stub.
 * Vite swaps in the sibling private package when that folder exists.
 */
export function proAlias(rootDir: string): Record<string, string> {
  const dir = shouldLoadPro(rootDir)
    ? resolve(rootDir, '../easy-candle-pro/src')
    : resolve(rootDir, 'src/pro/community')
  return {
    '@easy-candle/pro/main': resolve(dir, 'main.ts'),
    '@easy-candle/pro': resolve(dir, 'index.ts')
  }
}

/** Alias available to every process. Mirrors `@shared/*` in the tsconfigs. */
export function sharedAlias(rootDir: string): Record<string, string> {
  return {
    '@shared': resolve(rootDir, 'src/shared'),
    ...proAlias(rootDir)
  }
}

/** Renderer aliases. Mirrors `@/*` and `@shared/*` in `tsconfig.web.json`. */
export function rendererAlias(rootDir: string): Record<string, string> {
  return {
    '@': resolve(rootDir, 'src/renderer/src'),
    ...sharedAlias(rootDir)
  }
}
