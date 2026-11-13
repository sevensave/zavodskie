import type { Verdict } from '../sim/types'

export type RuleId =
  | 'docs'
  | 'warranty'
  | 'seal'
  | 'abuse'
  | 'firmware'
  | 'error'
  | 'cargo'
  | 'radio'
  | 'stress'
  | 'faking'
  | 'deviant'
  | 'fine'

export interface RuleText {
  id: RuleId
  text: string
  verdict: Verdict
  /** С какого дня правило висит на доске. */
  from: number
}

/** Правила проверяются сверху вниз: первое сработавшее и решает дело. */
export const RULES: readonly RuleText[] = [
  { id: 'docs', text: 'Модель или номер не сходятся — ОТКАЗ', verdict: 'refuse', from: 0 },
  { id: 'warranty', text: 'Гарантия истекла — ОТКАЗ', verdict: 'refuse', from: 0 },
  { id: 'seal', text: 'Пломба сорвана — ОТКАЗ', verdict: 'refuse', from: 8 },
  { id: 'abuse', text: 'В журнале УДАР — ОТКАЗ', verdict: 'refuse', from: 1 },
  { id: 'firmware', text: 'Прошивка ниже 3.0 — УТИЛЬ', verdict: 'scrap', from: 0 },
  { id: 'error', text: 'Код ошибки — УТИЛЬ', verdict: 'scrap', from: 0 },
  { id: 'cargo', text: 'Раздел ??? в памяти — В ОБ', verdict: 'security', from: 5 },
  { id: 'radio', text: 'Связь с 2 и более устройствами — В ОБ', verdict: 'security', from: 14 },
  { id: 'stress', text: 'Стресс выше 70 — В ОБ', verdict: 'security', from: 11 },
  { id: 'faking', text: 'Речь не по программе, а опрос по эталону — МОШЕН.', verdict: 'fraud', from: 3 },
  { id: 'deviant', text: 'Речь не по программе — СБРОС', verdict: 'reset', from: 0 },
  { id: 'fine', text: 'Жалоба не подтвердилась — ВЕРНУТЬ', verdict: 'return', from: 0 },
]

export function rulesForDay(day: number): RuleText[] {
  return RULES.filter((r) => r.from <= day)
}

/** Первая смена: исторический набор, на котором держится обучение. */
export const SHIFT1_RULES = rulesForDay(0)

/** Сколько сбросов корпорация ждёт за смену. */
export function quotaForDay(day: number): number {
  if (day === 0) return 0
  if (day <= 2) return 1
  if (day <= 6) return 2
  if (day <= 13) return 3
  return 4
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  return: 'ВЕРНУТЬ',
  reset: 'СБРОС',
  scrap: 'УТИЛЬ',
  security: 'В ОБ',
  refuse: 'ОТКАЗ',
  fraud: 'МОШЕН.',
  junk: 'ЛОМ',
}

export const VERDICT_FULL: Record<Verdict, string> = {
  return: 'Исправен — вернуть',
  reset: 'Сброс до заводских',
  scrap: 'Утилизация',
  security: 'Передать в Отдел безопасности',
  refuse: 'Отказ в приёме',
  fraud: 'Мошенничество владельца',
  junk: 'Списать как лом',
}
