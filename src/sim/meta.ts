import { ACHIEVEMENTS, type AchId } from '../content/achievements'
import { FILES } from '../content/files'
import type { EndlessMod } from '../content/modes'
import { FINAL_DAY, type Campaign } from './campaign'
import { ENDINGS_COUNT } from './endings'
import type { ShiftState } from './shift'
import type { EndingId } from './types'

// Мета-прогресс между забегами: картотека, достижения, рекорды режимов.
// Хранится отдельным слотом `meta`: новая кампания его не стирает.

export const META_VERSION = 1

/** Биты картотеки: встречен у окна, остался жить, не остался. */
export const FILE_MET = 1
export const FILE_SPARED = 2
export const FILE_LOST = 4

export interface EndlessRecord {
  score: number
  closed: number
  mods: EndlessMod[]
  day: number
  date: string
}

export interface Meta {
  v: number
  /** Больше всего закрытых смен в одной кампании. */
  bestDay: number
  /** Сколько кампаний доработано до последней смены. */
  finished: number
  files: Record<string, number>
  ach: AchId[]
  endless: EndlessRecord[]
  daily: Record<string, { score: number; code: string }>
}

export function emptyMeta(): Meta {
  return { v: META_VERSION, bestDay: 0, finished: 0, files: {}, ach: [], endless: [], daily: {} }
}

export function endlessUnlocked(m: Meta): boolean {
  return m.bestDay >= 7
}

export function plusUnlocked(m: Meta): boolean {
  return m.finished >= 1
}

export function filesFound(m: Meta): number {
  return FILES.filter((f) => (m.files[f.id] ?? 0) & FILE_MET).length
}

export type MetaEvent =
  | { kind: 'shift'; mode: 'campaign' | 'daily' | 'endless'; s: ShiftState; c?: Campaign }
  | { kind: 'home'; c: Campaign }
  | { kind: 'ending'; c: Campaign; seen: readonly EndingId[] }
  | { kind: 'daily'; key: string; score: number; code: string }
  | { kind: 'endless'; record: EndlessRecord }
  | { kind: 'plus' }

type Check = (m: Meta, e: MetaEvent) => boolean

const shift = (f: (s: ShiftState, c?: Campaign, mode?: string) => boolean): Check => (_m, e) => e.kind === 'shift' && f(e.s, e.c, e.mode)
const results = (f: (s: ShiftState) => boolean) => shift((s) => f(s))
const campaignShift = (f: (s: ShiftState, c: Campaign) => boolean) => shift((s, c, mode) => mode === 'campaign' && !!c && f(s, c))

const CHECKS: Record<AchId, Check> = {
  first_night: campaignShift((s, c) => s.day === 0 && !c.plus),
  disobey: campaignShift((s) => s.results.some((r) => r.caseId === '0-timosha' && r.spared)),
  first_junk: results((s) => s.results.some((r) => r.verdict === 'junk')),
  week: (m) => m.bestDay >= 7,
  fortnight: (m) => m.bestDay >= 14,
  machines: campaignShift((_s, c) => c.branch === 'machines'),
  corp_hold: campaignShift((s, c) => c.branch === 'corp' && s.day > 14),
  humans: results((s) => s.results.some((r) => s.queue.find((q) => q.id === r.caseId)?.escort)),
  perfect: results((s) => s.results.length >= 9 && s.results.every((r) => r.verdict === r.expected || r.verdict === 'junk')),
  spared5: results((s) => s.results.filter((r) => r.spared && r.device !== 'plant').length >= 5),
  overquota: results((s) => s.quota > 0 && s.results.filter((r) => r.verdict === 'reset').length >= s.quota * 2),
  bribe: results((s) => s.results.some((r) => r.bribe)),
  cheat: results((s) => s.results.some((r) => r.bribe && !r.bribe.honored)),
  marked: results((s) => s.results.some((r) => r.bribe?.agent)),
  not_fooled: results((s) => s.results.some((r) => r.device === 'plant' && !r.spared)),
  courier: results((s) => s.results.some((r) => r.device === 'courier' && r.verdict === 'junk')),
  dangerous: results((s) => s.results.some((r) => r.device === 'awake_dangerous' && r.verdict === 'security')),
  mirror: results((s) => s.flags.selfScan),
  clean_audit: campaignShift((_s, c) => !!c.last?.audit.happened && c.last.audit.fine === 0),
  savings: (_m, e) => (e.kind === 'home' || (e.kind === 'shift' && e.mode === 'campaign')) && (e.kind === 'home' ? e.c.money : e.c?.money ?? 0) >= 300,
  cold: (_m, e) => e.kind === 'home' && e.c.unpaid.heat >= 2,
  three_endings: (_m, e) => e.kind === 'ending' && e.seen.length >= 3,
  all_endings: (_m, e) => e.kind === 'ending' && e.seen.length >= ENDINGS_COUNT,
  escape: (_m, e) => e.kind === 'ending' && e.c.ending === 'escape',
  files10: (m) => filesFound(m) >= 10,
  files30: (m) => filesFound(m) >= 30,
  files60: (m) => filesFound(m) >= FILES.length,
  fates: (m) => Object.values(m.files).some((b) => (b & FILE_SPARED) !== 0 && (b & FILE_LOST) !== 0),
  daily: (_m, e) => e.kind === 'daily',
  daily100: (_m, e) => e.kind === 'daily' && e.score >= 100,
  endless15: (_m, e) => e.kind === 'endless' && e.record.closed >= 15,
  endless_strict: (_m, e) => e.kind === 'endless' && e.record.closed >= 10 && e.record.mods.includes('strict'),
  plus_start: (_m, e) => e.kind === 'plus',
  plus_end: (_m, e) => e.kind === 'ending' && !!e.c.plus && e.c.day >= FINAL_DAY,
}

/** Учесть смену в картотеке: кто назвался и чем для него кончилось. */
function recordFiles(files: Record<string, number>, s: ShiftState): Record<string, number> {
  const out = { ...files }
  for (const r of s.results) {
    const persona = s.queue.find((q) => q.id === r.caseId)?.persona
    if (!persona) continue
    out[persona] = (out[persona] ?? 0) | FILE_MET | (r.spared ? FILE_SPARED : FILE_LOST)
  }
  return out
}

/** Применить событие к мете: обновить прогресс и вернуть новые достижения. */
export function applyMeta(meta: Meta, e: MetaEvent): { meta: Meta; unlocked: AchId[] } {
  let m: Meta = { ...meta }
  if (e.kind === 'shift') {
    m.files = recordFiles(m.files, e.s)
    if (e.mode === 'campaign' && e.c) {
      const closed = e.c.history.length + (e.c.plus ? 1 : 0)
      m.bestDay = Math.max(m.bestDay, closed)
    }
  }
  if (e.kind === 'ending' && e.c.day >= FINAL_DAY) m.finished += 1
  if (e.kind === 'daily') {
    const prev = m.daily[e.key]
    if (!prev || e.score > prev.score) m.daily = { ...m.daily, [e.key]: { score: e.score, code: e.code } }
  }
  if (e.kind === 'endless') {
    m.endless = [...m.endless, e.record].sort((a, b) => b.score - a.score).slice(0, 5)
  }
  const unlocked = ACHIEVEMENTS.map((a) => a.id).filter((id) => !m.ach.includes(id) && CHECKS[id](m, e))
  if (unlocked.length) m = { ...m, ach: [...m.ach, ...unlocked] }
  return { meta: m, unlocked }
}

export function bestEndless(m: Meta): number {
  return m.endless[0]?.score ?? 0
}
