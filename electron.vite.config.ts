import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { appDefine, rendererAlias, sharedAlias } from './config/vite.shared'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: sharedAlias(__dirname)
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: sharedAlias(__dirname)
    }
  },
  renderer: {
    define: appDefine(__dirname),
    resolve: {
      alias: rendererAlias(__dirname)
    },
    plugins: [react()]
  }
})
