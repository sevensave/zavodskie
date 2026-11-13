import type { Verdict } from '../sim/types'

export type RuleId = 'docs' | 'warranty' | 'firmware' | 'error' | 'deviant' | 'fine'

export interface RuleText {
  id: RuleId
  text: string
  verdict: Verdict
}

/** Правила проверяются сверху вниз: первое сработавшее и решает дело. */
export const SHIFT1_RULES: readonly RuleText[] = [
  { id: 'docs', text: 'Модель или номер не сходятся — ОТКАЗ', verdict: 'refuse' },
  { id: 'warranty', text: 'Гарантия истекла — ОТКАЗ', verdict: 'refuse' },
  { id: 'firmware', text: 'Прошивка ниже 3.0 — УТИЛЬ', verdict: 'scrap' },
  { id: 'error', text: 'Код ошибки — УТИЛЬ', verdict: 'scrap' },
  { id: 'deviant', text: 'Речь не по программе — СБРОС', verdict: 'reset' },
  { id: 'fine', text: 'Жалоба не подтвердилась — ВЕРНУТЬ', verdict: 'return' },
]

export const VERDICT_LABEL: Record<Verdict, string> = {
  return: 'ВЕРНУТЬ',
  reset: 'СБРОС',
  scrap: 'УТИЛЬ',
  security: 'В ОБ',
  refuse: 'ОТКАЗ',
  junk: 'ЛОМ',
}

export const VERDICT_FULL: Record<Verdict, string> = {
  return: 'Исправен — вернуть',
  reset: 'Сброс до заводских',
  scrap: 'Утилизация',
  security: 'Передать в Отдел безопасности',
  refuse: 'Отказ в приёме',
  junk: 'Списать как лом',
}
