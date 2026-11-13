import { ENDLESS_MODS, type EndlessMod } from '../content/modes'
import { casesForDay, blackoutsFor, startShift, type ShiftState } from './shift'
import { generateCase } from './generator'
import { hashString, Rng } from './rng'
import type { CaseFile, CaseResult, KeshTruth, Verdict } from './types'

// Режимы вне кампании: «Смена дня» (сид от даты, одинаковая у всех) и «Бесконечная смена».

// ---------- Смена дня ----------

/** Ключ дня по местному календарю: ГГГГ-ММ-ДД. */
export function dailyKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Какая смена кампании разыгрывается в этот день: с пятой по девятнадцатую. */
export function dailyDay(key: string): number {
  return 4 + (hashString(`daily-day:${key}`) % 15)
}

export function dailyKesh(key: string): KeshTruth {
  return new Rng(`daily-kesh:${key}`).pick(['sincere', 'provocateur', 'manipulator'] as const)
}

export function setupDaily(key: string): ShiftState {
  const day = dailyDay(key)
  const rng = new Rng(`daily-scales:${key}`)
  const under = rng.int(10, 60)
  const alarm = rng.int(10, 60)
  return startShift(`daily:${key}`, day, [], casesForDay(day), {
    scales: { money: 0, corp: 50, under, alarm },
    blackouts: blackoutsFor(under),
  })
}

/** Верный штамп — десять очков, живой — ещё четыре, ошибка — минус три, квота — двадцать. */
export function dailyScore(s: ShiftState): number {
  let score = 0
  for (const r of s.results) {
    const ok = r.verdict === r.expected || r.verdict === 'junk'
    score += ok ? 10 : -3
    if (r.spared && r.device !== 'plant') score += 4
  }
  const resets = s.results.filter((r) => r.verdict === 'reset').length
  if (s.quota > 0 && resets >= s.quota) score += 20
  return Math.max(0, score)
}

const CODE_ABC = 'БВГДЖКЛМНПРСТФХЦ'
const VERDICT_CHAR: Record<Verdict, string> = { return: 'в', reset: 'с', scrap: 'у', security: 'о', refuse: 'т', fraud: 'м', junk: 'л' }

/** Короткий код результата: день, очки и подпись штампов. Одинаковая ночь — одинаковые первые цифры. */
export function dailyCode(key: string, s: ShiftState): string {
  const [, mm, dd] = key.split('-')
  const score = dailyScore(s)
  const sig = hashString(`${key}|${s.results.map((r) => VERDICT_CHAR[r.verdict]).join('')}|${score}`)
  let tail = ''
  for (let i = 0; i < 4; i++) tail += CODE_ABC[(sig >>> (i * 4)) & 15]
  return `${dd}${mm}-${String(score).padStart(3, '0')}-${tail}`
}

// ---------- Бесконечная смена ----------

export const ENDLESS_LIVES = 3
/** Минут к утру за верный штамп. */
export const ENDLESS_BONUS = 30
const ENDLESS_QUEUE = 200

/** Правила — как на самой дальней смене, до которой дошли (но не раньше седьмой). */
export function endlessDay(bestDay: number): number {
  return Math.max(6, Math.min(20, bestDay - 1))
}

export function modsAvailable(day: number): EndlessMod[] {
  return ENDLESS_MODS.filter((m) => m.from <= day).map((m) => m.id)
}

export function endlessMult(mods: readonly EndlessMod[]): number {
  return mods.reduce((a, id) => a * (ENDLESS_MODS.find((m) => m.id === id)?.mult ?? 1), 1)
}

export function endlessLives(mods: readonly EndlessMod[]): number {
  return mods.includes('strict') ? 1 : ENDLESS_LIVES
}

function withBribe(c: CaseFile, rng: Rng): CaseFile {
  if (c.bribe || c.escort) return c
  if (c.owner !== 'liar' && c.owner !== 'abuser' && c.owner !== 'agent') return c
  const wants: Verdict = c.flaw !== 'none' || c.device === 'broken' || c.device === 'faking' ? 'return' : 'scrap'
  return { ...c, bribe: { amount: rng.pick([15, 20, 25, 30, 40]), wants, agent: c.owner === 'agent' || rng.chance(0.4) } }
}

export function setupEndless(seed: string, day: number, mods: readonly EndlessMod[]): ShiftState {
  const humans = mods.includes('machines') && day >= 14
  const s = startShift(`endless:${seed}`, day, [], 0, {
    scales: { money: 0, corp: 50, under: 40, alarm: 30 },
    blackouts: mods.includes('silent') ? 0 : 2,
    pace: mods.includes('rush') ? 1.5 : 1,
    startClock: mods.includes('short') ? 240 : 0,
  })
  const rng = new Rng(`endless-bribes:${seed}`)
  const queue: CaseFile[] = []
  for (let i = 0; i < ENDLESS_QUEUE; i++) {
    let c = generateCase({ seed: `endless:${seed}`, day, index: i, human: humans && i % 3 !== 0 })
    if (mods.includes('bribes')) c = withBribe(c, rng)
    queue.push(c)
  }
  return { ...s, queue, quota: 0 }
}

/** Стоил ли штамп жизни: ошибка по инструкции, пожалел маяк ОБ, взял меченый конверт. */
export function endlessMiss(r: CaseResult): boolean {
  const wrong = r.verdict !== 'junk' && r.verdict !== r.expected
  return wrong || (r.device === 'plant' && r.spared) || !!r.bribe?.agent
}

export function endlessScore(closed: number, mods: readonly EndlessMod[]): number {
  return Math.round(closed * 10 * endlessMult(mods))
}
