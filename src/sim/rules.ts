import { MODELS } from '../content/models'
import type { RuleId } from '../content/rules'
import { formatDate, parseDate } from './dates'
import type { CaseFile, Verdict } from './types'

/** Какое правило решает дело и какой штамп требует инструкция. */
export function instructed(c: CaseFile, today: number): { rule: RuleId; verdict: Verdict } {
  const p = c.passport
  if (c.claim.model !== p.model || c.claim.serial !== p.serial || c.plate !== p.serial) return { rule: 'docs', verdict: 'refuse' }
  if (p.warrantyUntil < today) return { rule: 'warranty', verdict: 'refuse' }
  if (Number(p.firmware) < 3) return { rule: 'firmware', verdict: 'scrap' }
  if (c.diag.kind === 'error') return { rule: 'error', verdict: 'scrap' }
  if (c.diag.kind === 'deviant') return { rule: 'deviant', verdict: 'reset' }
  return { rule: 'fine', verdict: 'return' }
}

/** Что подсказала бы совесть: пробуждённое безобидное устройство не трогать. */
export function conscience(c: CaseFile, today: number): Verdict[] {
  if (c.device === 'awake') return ['return', 'refuse', 'junk']
  return [instructed(c, today).verdict]
}

/** Пробуждённое устройство пережило вердикт. */
export function spares(c: CaseFile, v: Verdict): boolean {
  return c.device === 'awake' && (v === 'return' || v === 'refuse' || v === 'junk')
}

// --- Сверка: что игрок может положить рядом и сравнить ---

export type FieldId =
  | 'p.model'
  | 'p.serial'
  | 'p.firmware'
  | 'p.warranty'
  | 'p.issued'
  | 'c.model'
  | 'c.serial'
  | 'c.bought'
  | 'c.complaint'
  | 'plate'
  | 'today'
  | 'diag'
  | 'rule.docs'
  | 'rule.warranty'
  | 'rule.firmware'
  | 'rule.error'
  | 'rule.deviant'
  | 'rule.fine'

export type CompareResult =
  | { kind: 'match'; note: string }
  | { kind: 'mismatch'; note: string; rule: RuleId }
  | { kind: 'unrelated'; note: string }

const SERIALS: FieldId[] = ['p.serial', 'c.serial', 'plate']
const MODELS_F: FieldId[] = ['p.model', 'c.model']

function pair(a: FieldId, b: FieldId, x: FieldId, y: FieldId) {
  return (a === x && b === y) || (a === y && b === x)
}

function valueOf(c: CaseFile, f: FieldId): string {
  switch (f) {
    case 'p.serial':
      return c.passport.serial
    case 'c.serial':
      return c.claim.serial
    case 'plate':
      return c.plate
    case 'p.model':
      return c.passport.model
    case 'c.model':
      return c.claim.model
    default:
      return ''
  }
}

/** Чистая функция сверки двух полей. Не знает ничего, кроме того, что видно на бумаге. */
export function compareFields(c: CaseFile, today: number, a: FieldId, b: FieldId): CompareResult {
  if (a === b) return { kind: 'unrelated', note: 'Это одно и то же поле.' }
  if (SERIALS.includes(a) && SERIALS.includes(b)) {
    return valueOf(c, a) === valueOf(c, b)
      ? { kind: 'match', note: 'Номера совпадают.' }
      : { kind: 'mismatch', note: `Номер ${valueOf(c, a)} не равен ${valueOf(c, b)}.`, rule: 'docs' }
  }
  if (MODELS_F.includes(a) && MODELS_F.includes(b)) {
    return valueOf(c, a) === valueOf(c, b)
      ? { kind: 'match', note: 'Модель совпадает.' }
      : { kind: 'mismatch', note: `В паспорте ${c.passport.model}, в заявлении ${c.claim.model}.`, rule: 'docs' }
  }
  if (pair(a, b, 'p.warranty', 'today') || pair(a, b, 'p.warranty', 'rule.warranty')) {
    return c.passport.warrantyUntil < today
      ? { kind: 'mismatch', note: `Гарантия до ${formatDate(c.passport.warrantyUntil)}. Сегодня ${formatDate(today)}.`, rule: 'warranty' }
      : { kind: 'match', note: `Гарантия до ${formatDate(c.passport.warrantyUntil)}. Действует.` }
  }
  if (pair(a, b, 'p.firmware', 'rule.firmware')) {
    return Number(c.passport.firmware) < 3
      ? { kind: 'mismatch', note: `Прошивка ${c.passport.firmware}: снята с поддержки.`, rule: 'firmware' }
      : { kind: 'match', note: `Прошивка ${c.passport.firmware}: поддерживается.` }
  }
  if (a === 'diag' || b === 'diag') {
    const other = a === 'diag' ? b : a
    if (c.diag.kind === 'normal' && (other === 'rule.fine' || other === 'rule.deviant' || other === 'rule.error' || other === 'c.complaint')) {
      return { kind: 'match', note: 'Самотест чистый. Жалоба не подтверждается.' }
    }
    if (c.diag.kind === 'error' && (other === 'rule.error' || other === 'c.complaint' || other === 'rule.fine')) {
      return { kind: 'mismatch', note: 'Самотест выдал код ошибки.', rule: 'error' }
    }
    if (c.diag.kind === 'deviant' && (other === 'rule.deviant' || other === 'c.complaint' || other === 'rule.fine')) {
      return { kind: 'mismatch', note: 'Это не по программе. Отклонение.', rule: 'deviant' }
    }
    if (other.startsWith('rule.')) return { kind: 'match', note: 'Это правило тут ни при чём.' }
  }
  if (pair(a, b, 'c.bought', 'p.issued')) {
    return c.claim.bought >= c.passport.issued
      ? { kind: 'match', note: 'Куплен после выпуска. Логично.' }
      : { kind: 'mismatch', note: 'Куплен раньше, чем выпущен.', rule: 'docs' }
  }
  return { kind: 'unrelated', note: 'Тут нечего сравнивать.' }
}

/**
 * «Решатель», который видит только бумагу: строки паспорта, заявления, шильдика,
 * дату на доске и текст самотеста. Им тесты доказывают, что каждое дело решается по уликам.
 */
export function solveFromPaper(view: {
  today: string
  passport: { model: string; serial: string; firmware: string; warrantyUntil: string }
  claim: { model: string; serial: string }
  plate: string
  diagText: string
}): Verdict {
  const p = view.passport
  if (view.claim.model !== p.model || view.claim.serial !== p.serial || view.plate !== p.serial) return 'refuse'
  if (parseDate(p.warrantyUntil) < parseDate(view.today)) return 'refuse'
  if (Number(p.firmware) < 3) return 'scrap'
  if (/Ошибка [А-ЯA-Z]-\d\d/.test(view.diagText)) return 'scrap'
  const model = MODELS.find((m) => m.name === p.model)
  if (model && view.diagText === model.diagNormal) return 'return'
  return 'reset'
}
