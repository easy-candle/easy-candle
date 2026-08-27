import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { appDefine, rendererAlias, sharedAlias } from './config/vite.shared'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: appDefine(__dirname),
    resolve: {
      alias: sharedAlias(__dirname)
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    define: appDefine(__dirname),
    resolve: {
      alias: sharedAlias(__dirname)
    }
  },
  renderer: {
    define: appDefine(__dirname),
    resolve: {
      alias: rendererAlias(__dirname)
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          splash: resolve(__dirname, 'src/renderer/splash.html')
        }
      }
    },
    server: {
      fs: {
        allow: [
          __dirname,
          resolve(__dirname, '../easy-candle-pro'),
          resolve(__dirname, 'easy-candle-pro')
        ]
      }
    }
  }
})
