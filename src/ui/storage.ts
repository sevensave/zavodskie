// Сохранения: в Electron — JSON в папке данных пользователя (через preload), в браузере — localStorage.

export async function loadSlot<T>(slot: string): Promise<T | null> {
  try {
    const raw = window.zavod ? await window.zavod.readSave(slot) : localStorage.getItem(`zavod:${slot}`)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export async function saveSlot(slot: string, data: unknown): Promise<void> {
  const raw = JSON.stringify(data)
  try {
    if (window.zavod) await window.zavod.writeSave(slot, raw)
    else localStorage.setItem(`zavod:${slot}`, raw)
  } catch {
    // Не удалось сохранить: игра продолжается, прогресс смены просто не запишется.
  }
}
