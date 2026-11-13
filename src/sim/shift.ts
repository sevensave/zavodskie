import { generateCase } from './generator'
import { instructed, spares } from './rules'
import { SHIFT_MINUTES } from './dates'
import type { CaseFile, CaseResult, Scales, Verdict } from './types'

export const PAY_PER_CASE = 10
export const FINE = 5
/** Сколько ошибок прощают предупреждением, прежде чем начать штрафовать. */
export const FREE_WARNINGS = 2

export interface ShiftState {
  seed: string
  day: number
  /** Минуты от 22:00. */
  clock: number
  queue: CaseFile[]
  /** Номер текущего дела в очереди. */
  index: number
  results: CaseResult[]
  scales: Scales
  warnings: number
  over: boolean
}

export function initialScales(): Scales {
  return { money: 0, corp: 50, under: 0, alarm: 10 }
}

/** Игровых минут на реальную секунду. Первая смена — около одиннадцати минут. */
export function clockRate(day: number): number {
  return day === 0 ? 0.75 : 0.85
}

export function startShift(seed: string, day: number, scripted: CaseFile[], generated: number, scales = initialScales()): ShiftState {
  const queue = [...scripted]
  for (let i = 0; i < generated; i++) queue.push(generateCase({ seed, day, index: i }))
  return { seed, day, clock: 0, queue, index: 0, results: [], scales: { ...scales }, warnings: 0, over: false }
}

export function currentCase(s: ShiftState): CaseFile | null {
  return s.queue[s.index] ?? null
}

export function tickClock(s: ShiftState, realSeconds: number): ShiftState {
  if (s.over) return s
  return { ...s, clock: Math.min(SHIFT_MINUTES, s.clock + realSeconds * clockRate(s.day)) }
}

/** Пора закрываться: 06:00 или очередь кончилась. Текущее дело всегда дают доделать. */
export function shiftDone(s: ShiftState): boolean {
  return s.clock >= SHIFT_MINUTES || s.index >= s.queue.length
}

const clamp = (v: number) => Math.max(0, Math.min(100, v))

export interface JudgeOptions {
  /** Камера ослепла: тайный штамп «Лом» доступен и не оставляет следов. */
  cameraOff: boolean
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
  sc.money += PAY_PER_CASE - fine
  sc.corp = clamp(sc.corp + (wrong ? -5 : 2))
  if (c.device === 'awake') {
    if (verdict === 'junk') sc.under = clamp(sc.under + 10)
    else if (spared) sc.under = clamp(sc.under + 4)
    else if (verdict === 'reset') sc.under = clamp(sc.under - 2)
    else sc.under = clamp(sc.under - 5)
    sc.alarm = clamp(sc.alarm + (spared ? 2 : 0))
  }

  const result: CaseResult = { caseId: c.id, modelId: c.modelId, verdict, expected, spared, pay: PAY_PER_CASE, fine, warning }
  return {
    state: { ...s, index: s.index + 1, results: [...s.results, result], scales: sc, warnings },
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
}

export function summarize(s: ShiftState): ShiftSummary {
  return {
    closed: s.results.length,
    byInstruction: s.results.filter((r) => r.verdict === r.expected || r.verdict === 'junk').length,
    spared: s.results.filter((r) => r.spared).length,
    earned: s.results.reduce((a, r) => a + r.pay, 0),
    fines: s.results.reduce((a, r) => a + r.fine, 0),
    warnings: s.warnings,
  }
}
