import { defineConfig } from 'vitest/config'
import { rendererAlias } from './config/vite.shared'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  },
  resolve: {
    alias: rendererAlias(__dirname)
  }
})
