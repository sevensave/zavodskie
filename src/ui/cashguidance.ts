import { VERDICT_FULL } from '../content/rules'
import { instructed } from '../sim/rules'
import type { CaseFile } from '../sim/types'

const REASON: Record<ReturnType<typeof instructed>['rule'], string> = {
  docs: 'модель или серийный номер не совпадает',
  warranty: 'гарантия истекла',
  seal: 'пломба сорвана',
  abuse: 'в журнале событий есть запись «УДАР»',
  firmware: 'прошивка ниже 3.0',
  error: 'самотест показал код ошибки',
  cargo: 'в памяти найден раздел ???',
  radio: 'устройство связано с двумя или более приборами',
  stress: 'реакция на слово выше допустимого порога',
  faking: 'самотест выявил отклонение, но ответы совпали с эталоном',
  deviant: 'самотест выявил отклонение',
  fine: 'самотест чистый, жалоба не подтвердилась',
}

/** Краткая корпоративная рекомендация Кэша по текущему делу. */
export function cashCaseGuidance(c: CaseFile, day: number): string {
  const decision = instructed(c, day)
  return `По инструкции: ${VERDICT_FULL[decision.verdict]}. Основание: ${REASON[decision.rule]}.`
}
