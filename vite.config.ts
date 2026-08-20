import { readFileSync } from 'node:fs'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appVersion = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  server: {
    port: 3000,
    host: '0.0.0.0'
  }
})
