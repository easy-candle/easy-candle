import { app, ipcMain, shell, BrowserWindow, Menu, screen, type IpcMainEvent } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IPC_CHANNELS } from '@shared/ipc/channels'
import icon from '../../resources/icon.png?asset'
import { registerMain as registerProMain } from '@easy-candle/pro/main'
import { registerAuthIpc } from './auth'
import { registerImportIpc } from './importStore'
import { registerKlinesIpc } from './klines'
import { registerMtBridgeIpc, stopMtBridge } from './mtBridge'
import { setupAutoUpdater } from './updater'

/** Minimum splash time so the card does not flash. Set to 0 later if unused. */
const SPLASH_MIN_MS = 400
/** Do not keep the splash forever if Binance or the API hang. */
const STARTUP_TIMEOUT_MS = 20_000
const SPLASH_WIDTH = 640
const SPLASH_HEIGHT = 380

function loadRendererPage(
  win: BrowserWindow,
  page: 'index.html' | 'splash.html',
  query?: Record<string, string>
): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const origin = process.env['ELECTRON_RENDERER_URL'].replace(/\/$/, '')
    const path = page === 'index.html' ? '/' : `/${page}`
    const search = query ? `?${new URLSearchParams(query).toString()}` : ''
    void win.loadURL(`${origin}${path}${search}`)
    return
  }
  void win.loadFile(join(__dirname, '../renderer', page), query ? { query } : undefined)
}

function splashBounds(): { x: number; y: number; width: number; height: number } {
  const area = screen.getPrimaryDisplay().workArea
  return {
    width: SPLASH_WIDTH,
    height: SPLASH_HEIGHT,
    x: Math.round(area.x + (area.width - SPLASH_WIDTH) / 2),
    y: Math.round(area.y + (area.height - SPLASH_HEIGHT) / 2)
  }
}

function createSplashWindow(version: string): BrowserWindow {
  const splash = new BrowserWindow({
    ...splashBounds(),
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    roundedCorners: true,
    backgroundColor: '#18181b',
    title: 'Easy Candle',
    icon,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  loadRendererPage(splash, 'splash.html', { v: version })
  return splash
}

function revealMainWindow(mainWindow: BrowserWindow, splash: BrowserWindow | null, version: string): void {
  if (mainWindow.isDestroyed()) return
  const { workArea } = screen.getPrimaryDisplay()
  mainWindow.setTitle(`Easy Candle v${version}`)
  mainWindow.setBounds(workArea, false)
  mainWindow.maximize()
  if (splash && !splash.isDestroyed()) {
    splash.destroy()
  }
  mainWindow.show()
}

function createWindow(): void {
  const version = app.getVersion()
  const splash = createSplashWindow(version)
  let splashShownAt = 0
  let mainPainted = false
  let startupReady = false
  let revealed = false
  let startupTimeout: ReturnType<typeof setTimeout> | undefined

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    title: `Easy Candle v${version}`,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const tryReveal = (): void => {
    if (revealed || !mainPainted || !startupReady || splashShownAt === 0) return
    revealed = true
    if (startupTimeout) clearTimeout(startupTimeout)
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashShownAt))
    setTimeout(() => {
      revealMainWindow(mainWindow, splash, version)
    }, wait)
  }

  splash.on('ready-to-show', () => {
    splash.show()
    splashShownAt = Date.now()
    startupTimeout = setTimeout(() => {
      startupReady = true
      tryReveal()
    }, STARTUP_TIMEOUT_MS)
    tryReveal()
  })

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED_CHANGED, false)
  })

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
  })

  mainWindow.on('ready-to-show', () => {
    mainPainted = true
    tryReveal()
  })

  const onStartupReady = (event: IpcMainEvent): void => {
    if (event.sender !== mainWindow.webContents) return
    startupReady = true
    tryReveal()
  }
  ipcMain.on(IPC_CHANNELS.WINDOW_STARTUP_READY, onStartupReady)
  mainWindow.on('closed', () => {
    ipcMain.removeListener(IPC_CHANNELS.WINDOW_STARTUP_READY, onStartupReady)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  loadRendererPage(mainWindow, 'index.html')
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.easycandle.app')

  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion())

  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  registerKlinesIpc()
  registerImportIpc()
  registerMtBridgeIpc()
  registerAuthIpc()
  registerProMain()
  setupAutoUpdater()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  stopMtBridge()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
