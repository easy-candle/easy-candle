import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { appDefine, rendererAlias } from './config/vite.shared'

// https://vitejs.dev/config/
export default defineConfig({
  define: appDefine(__dirname),
  plugins: [react()],
  resolve: {
    alias: rendererAlias(__dirname)
  },
  server: {
    port: 3000,
    host: '0.0.0.0'
  }
})
