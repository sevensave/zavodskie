import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Сохранения живут только в пользовательской папке данных: папку установки
// лаунчер SevenSave подменяет целиком при обновлении.
const SLOT = /^[a-z0-9-]{1,32}$/

function dir() {
  return join(app.getPath('userData'), 'saves')
}

export async function readSave(slot: string): Promise<string | null> {
  if (!SLOT.test(slot)) return null
  try {
    return await readFile(join(dir(), `${slot}.json`), 'utf8')
  } catch {
    return null
  }
}

export async function writeSave(slot: string, data: string): Promise<boolean> {
  if (!SLOT.test(slot) || data.length > 2_000_000) return false
  await mkdir(dir(), { recursive: true })
  const file = join(dir(), `${slot}.json`)
  // Сначала во временный файл, потом подмена: выключенный посреди записи компьютер не убьёт сохранение.
  const tmp = `${file}.tmp`
  await writeFile(tmp, data, 'utf8')
  await rename(tmp, file)
  return true
}
