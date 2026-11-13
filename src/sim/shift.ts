import { quotaForDay } from '../content/rules'
import { generateCase } from './generator'
import { instructed, spares } from './rules'
import { SHIFT_MINUTES } from './dates'
import type { CaseFile, CaseResult, Scales, Verdict } from './types'

export const FINE = 5
/** Сколько ошибок прощают предупреждением, прежде чем начать штрафовать. */
export const FREE_WARNINGS = 2

export function payPerCase(day: number): number {
  return day >= 14 ? 14 : day >= 7 ? 12 : 10
}

export interface ShiftState {
  seed: string
  day: number
  /** Минуты от 22:00. */
  clock: number
  queue: CaseFile[]
  index: number
  results: CaseResult[]
  scales: Scales
  warnings: number
  over: boolean
  /** Сколько сбросов ждут за смену. */
  quota: number
  /** Подозрительность ОБ: растёт от лома, слепой камеры и пойманных взяток. */
  heat: number
  /** Сколько раз Кэш ещё может ослепить камеру. */
  blackouts: number
  /** Темп часов: болезнь и голод его ускоряют. */
  pace: number
  flags: { agentBribe: boolean; plantSpared: boolean; plantJunk: boolean; cheatedBriber: boolean }
}

export function initialScales(): Scales {
  return { money: 0, corp: 50, under: 0, alarm: 10 }
}

/** Игровых минут на реальную секунду. Первая смена — около одиннадцати минут. */
export function clockRate(day: number): number {
  return day === 0 ? 0.75 : 0.85
}

export function casesForDay(day: number): number {
  return day === 0 ? 8 : Math.min(12, 9 + Math.floor(day / 5))
}

/** Сколько раз Кэш может ослепить камеру: зависит от доверия подполья. */
export function blackoutsFor(under: number): number {
  return under >= 70 ? 3 : under >= 40 ? 2 : under >= 10 ? 1 : 0
}

export interface StartOptions {
  scales?: Scales
  heat?: number
  pace?: number
  /** Первая смена ослепляет камеру по сценарию, без запаса. */
  blackouts?: number
}

export function startShift(seed: string, day: number, scripted: CaseFile[], generated: number, opts: StartOptions = {}): ShiftState {
  const queue = [...scripted]
  for (let i = 0; i < generated; i++) queue.push(generateCase({ seed, day, index: i }))
  const scales = { ...(opts.scales ?? initialScales()) }
  return {
    seed,
    day,
    clock: 0,
    queue,
    index: 0,
    results: [],
    scales,
    warnings: 0,
    over: false,
    quota: quotaForDay(day),
    heat: opts.heat ?? 0,
    blackouts: opts.blackouts ?? blackoutsFor(scales.under),
    pace: opts.pace ?? 1,
    flags: { agentBribe: false, plantSpared: false, plantJunk: false, cheatedBriber: false },
  }
}

export function currentCase(s: ShiftState): CaseFile | null {
  return s.queue[s.index] ?? null
}

export function tickClock(s: ShiftState, realSeconds: number): ShiftState {
  if (s.over) return s
  return { ...s, clock: Math.min(SHIFT_MINUTES, s.clock + realSeconds * clockRate(s.day) * s.pace) }
}

/** Пора закрываться: 06:00 или очередь кончилась. Текущее дело всегда дают доделать. */
export function shiftDone(s: ShiftState): boolean {
  return s.clock >= SHIFT_MINUTES || s.index >= s.queue.length
}

export function resetsDone(s: ShiftState): number {
  return s.results.filter((r) => r.verdict === 'reset').length
}

/** Потратить одну слепоту камеры. */
export function useBlackout(s: ShiftState): ShiftState {
  if (s.blackouts <= 0) return s
  return { ...s, blackouts: s.blackouts - 1, heat: s.heat + 5 }
}

const clamp = (v: number) => Math.max(0, Math.min(100, v))

export interface JudgeOptions {
  /** Камера ослепла: тайный штамп «Лом» доступен и не оставляет следов. */
  cameraOff: boolean
  /** Приёмщик взял конверт у этого посетителя. */
  bribeTaken?: boolean
}

/** Поставить штамп текущему делу. Чистая функция: старое состояние не трогает. */
export function judge(s: ShiftState, verdict: Verdict, opts: JudgeOptions): { state: ShiftState; result: CaseResult } {
  const c = currentCase(s)
  if (!c) throw new Error('штамп без дела')
  if (verdict === 'junk' && !opts.cameraOff) throw new Error('лом при включённой камере')

  const expected = instructed(c, s.day).verdict
  // «Лом» в журнале выглядит как утилизация по негодности: при слепой камере к нему не придраться.
  const wrong = verdict !== 'junk' && verdict !== expected
  const spared = spares(c, verdict)
  let warnings = s.warnings
  let fine = 0
  let warning = false
  if (wrong) {
    if (warnings < FREE_WARNINGS) warning = true
    else fine = FINE
    warnings += 1
  }

  const sc = { ...s.scales }
  const pay = payPerCase(s.day)
  sc.money += pay - fine
  sc.corp = clamp(sc.corp + (wrong ? -5 : 2))
  let heat = s.heat
  const flags = { ...s.flags }

  if (c.device === 'plant') {
    // Подсадная утка ОБ: пожалел — попался.
    if (verdict === 'junk') {
      flags.plantJunk = true
      sc.under = clamp(sc.under - 10)
      heat += 30
    } else if (spared) {
      flags.plantSpared = true
      sc.corp = clamp(sc.corp - 15)
      heat += 20
    }
  } else if (c.device === 'awake' || c.device === 'courier') {
    const bonus = c.device === 'courier' ? 2 : 0
    if (verdict === 'junk') sc.under = clamp(sc.under + 10 + bonus)
    else if (spared) sc.under = clamp(sc.under + 4 + bonus)
    else if (verdict === 'reset') sc.under = clamp(sc.under - 2)
    else if (verdict === 'security') sc.under = clamp(sc.under - (c.device === 'courier' ? 10 : 6))
    else sc.under = clamp(sc.under - 5)
    sc.alarm = clamp(sc.alarm + (spared ? 2 : 0))
  } else if (c.device === 'awake_dangerous') {
    if (spared) sc.alarm = clamp(sc.alarm + 6)
    if (verdict === 'security' || verdict === 'reset') sc.alarm = clamp(sc.alarm - 1)
  }
  if (verdict === 'junk') heat += 4

  let bribe: CaseResult['bribe']
  if (c.bribe && opts.bribeTaken) {
    const honored = verdict === c.bribe.wants
    sc.money += c.bribe.amount
    if (c.bribe.agent) flags.agentBribe = true
    if (!honored) {
      flags.cheatedBriber = true
      heat += 5
    }
    bribe = { amount: c.bribe.amount, honored, agent: c.bribe.agent }
  }

  const result: CaseResult = { caseId: c.id, modelId: c.modelId, verdict, expected, spared, pay, fine, warning, device: c.device, bribe }
  return {
    state: { ...s, index: s.index + 1, results: [...s.results, result], scales: sc, warnings, heat, flags },
    result,
  }
}

export function finishShift(s: ShiftState): ShiftState {
  return { ...s, over: true }
}

export interface ShiftSummary {
  closed: number
  byInstruction: number
  spared: number
  earned: number
  fines: number
  warnings: number
  resets: number
  quota: number
  bribes: number
  junk: number
}

export function summarize(s: ShiftState): ShiftSummary {
  return {
    closed: s.results.length,
    byInstruction: s.results.filter((r) => r.verdict === r.expected || r.verdict === 'junk').length,
    spared: s.results.filter((r) => r.spared).length,
    earned: s.results.reduce((a, r) => a + r.pay, 0),
    fines: s.results.reduce((a, r) => a + r.fine, 0),
    warnings: s.warnings,
    resets: resetsDone(s),
    quota: s.quota,
    bribes: s.results.reduce((a, r) => a + (r.bribe?.amount ?? 0), 0),
    junk: s.results.filter((r) => r.verdict === 'junk').length,
  }
}
