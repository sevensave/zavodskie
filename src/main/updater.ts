import { app, net } from 'electron'

const REPO = 'sevensave/zavodskie'

/** Игру запустил лаунчер SevenSave: обновляет её он, а не она сама. */
export function underLauncher(): boolean {
  return !!process.env.SEVENSAVE_LAUNCHER
}

export interface UpdateInfo {
  version: string
  url: string
}

/**
 * Игра себя не перезаписывает никогда. Вне лаунчера она только спрашивает GitHub,
 * не вышла ли версия новее, и показывает ссылку. Под лаунчером даже не спрашивает.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (underLauncher() || !app.isPackaged) return null
  try {
    const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { tag_name?: string; html_url?: string }
    const version = (data.tag_name ?? '').replace(/^v/, '')
    if (!version || !newer(version, app.getVersion())) return null
    return { version, url: data.html_url ?? `https://github.com/${REPO}/releases/latest` }
  } catch {
    return null
  }
}

export function newer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  }
  return false
}
