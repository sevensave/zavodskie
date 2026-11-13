import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron'
import { join } from 'node:path'
import { readSave, writeSave } from './saves'
import { checkForUpdate, underLauncher } from './updater'

if (!app.requestSingleInstanceLock()) app.quit()

app.setAppUserModelId('com.sevensave.zavodskie')

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    // 480×270 × 3: внутреннее разрешение игры, умноженное на целое.
    width: 1440,
    height: 810,
    useContentSize: true,
    minWidth: 960,
    minHeight: 540,
    show: false,
    title: 'Заводские настройки',
    backgroundColor: '#0b0a10',
    icon: join(import.meta.dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })

  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!process.env.ELECTRON_RENDERER_URL || !url.startsWith(process.env.ELECTRON_RENDERER_URL)) e.preventDefault()
  })
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win?.setFullScreen(!win.isFullScreen())
      e.preventDefault()
    }
    // В релизе не даём случайно перезагрузить окно посреди смены.
    if (app.isPackaged && (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r'))) {
      e.preventDefault()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

function setupIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    launcher: underLauncher(),
  }))
  ipcMain.handle('save:read', (_e, slot: unknown) => readSave(String(slot)))
  ipcMain.handle('save:write', (_e, slot: unknown, data: unknown) => writeSave(String(slot), String(data)))
  ipcMain.handle('update:check', () => checkForUpdate())
  ipcMain.on('win:fullscreen', () => win?.setFullScreen(!win.isFullScreen()))
  ipcMain.on('app:quit', () => app.quit())
  ipcMain.on('app:open', (_e, url: unknown) => {
    if (typeof url === 'string' && url.startsWith('https://')) void shell.openExternal(url)
  })
}

function setupSession() {
  const allowed = new Set(['fullscreen'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
}

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.whenReady().then(() => {
  setupSession()
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }])
      : null,
  )
  setupIpc()
  createWindow()
})

app.on('window-all-closed', () => app.quit())
