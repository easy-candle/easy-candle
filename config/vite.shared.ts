import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Config shared by `electron.vite.config.ts`, `vite.config.ts` and `vitest.config.ts`.
 *
 * `rootDir` is passed in by each caller (its own `__dirname`) instead of being
 * derived here, because these helpers are inlined into the bundled config and
 * cannot rely on their own module location.
 */

/** Read `version` from package.json at build time. */
export function readAppVersion(rootDir: string): string {
  const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as {
    version: string
  }
  return pkg.version
}

/** Compile-time constants; must stay in sync with `src/renderer/src/env.d.ts`. */
export function appDefine(rootDir: string): Record<string, string> {
  return {
    __APP_VERSION__: JSON.stringify(readAppVersion(rootDir))
  }
}

/** Alias available to every process. Mirrors `@shared/*` in the tsconfigs. */
export function sharedAlias(rootDir: string): Record<string, string> {
  return {
    '@shared': resolve(rootDir, 'src/shared')
  }
}

/** Renderer aliases. Mirrors `@/*` and `@shared/*` in `tsconfig.web.json`. */
export function rendererAlias(rootDir: string): Record<string, string> {
  return {
    '@': resolve(rootDir, 'src/renderer/src'),
    ...sharedAlias(rootDir)
  }
}
