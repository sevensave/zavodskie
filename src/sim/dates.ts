/** Дни считаем от первой смены: день 0 — 14.11.47. */
const BASE = Date.UTC(2047, 10, 14)
const DAY = 86_400_000

export function formatDate(day: number): string {
  const d = new Date(BASE + day * DAY)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0')
  return `${dd}.${mm}.${yy}`
}

/** Обратно из ДД.ММ.ГГ в номер дня. Нужен «решателю», который смотрит только на бумаги. */
export function parseDate(s: string): number {
  const m = /^(\d\d)\.(\d\d)\.(\d\d)$/.exec(s)
  if (!m) throw new Error(`плохая дата: ${s}`)
  const t = Date.UTC(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return Math.round((t - BASE) / DAY)
}

/** Минуты смены: 0 — 22:00, 480 — 06:00. */
export function formatClock(minutes: number): string {
  const total = (22 * 60 + Math.floor(minutes)) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export const SHIFT_MINUTES = 480
