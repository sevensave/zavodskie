export interface AppInfo {
  version: string
  platform: string
  launcher: boolean
}

export interface ZavodApi {
  info(): Promise<AppInfo>
  readSave(slot: string): Promise<string | null>
  writeSave(slot: string, data: string): Promise<boolean>
  checkUpdate(): Promise<{ version: string; url: string } | null>
  toggleFullscreen(): void
  quit(): void
  openExternal(url: string): void
}

declare global {
  interface Window {
    zavod?: ZavodApi
  }
}
