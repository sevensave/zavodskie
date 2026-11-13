import { contextBridge, ipcRenderer } from 'electron'
import type { ZavodApi } from './api'

const api: ZavodApi = {
  info: () => ipcRenderer.invoke('app:info'),
  readSave: (slot) => ipcRenderer.invoke('save:read', slot),
  writeSave: (slot, data) => ipcRenderer.invoke('save:write', slot, data),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  toggleFullscreen: () => ipcRenderer.send('win:fullscreen'),
  quit: () => ipcRenderer.send('app:quit'),
  openExternal: (url) => ipcRenderer.send('app:open', url),
}

contextBridge.exposeInMainWorld('zavod', api)
