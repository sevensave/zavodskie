import { MODELS } from '../content/models'
import { rulesForDay, type RuleId } from '../content/rules'
import { PARTITION, STRESS_LIMIT, TOOL_DAY } from '../content/tools'
import { formatDate, parseDate } from './dates'
import type { CaseFile, Verdict } from './types'

export function hasAbuse(c: CaseFile): boolean {
  return c.tools.log.some((e) => e.text.startsWith('УДАР'))
}
export function hasPartition(c: CaseFile, name: string): boolean {
  return c.tools.memory.parts.some((p) => p.name === name)
}
export function oprosCanon(c: CaseFile): boolean {
  return c.tools.answers.every((a, i) => a === c.tools.canon[i])
}

/** Какое правило решает дело и какой штамп требует инструкция в этот день. */
export function instructed(c: CaseFile, day: number): { rule: RuleId; verdict: Verdict } {
  const p = c.passport
  const on = new Set(rulesForDay(day).map((r) => r.id))
  if (c.claim.model !== p.model || c.claim.serial !== p.serial || c.plate !== p.serial) return { rule: 'docs', verdict: 'refuse' }
  if (p.warrantyUntil < day) return { rule: 'warranty', verdict: 'refuse' }
  if (on.has('seal') && c.tools.seals.includes(false)) return { rule: 'seal', verdict: 'refuse' }
  if (on.has('abuse') && hasAbuse(c)) return { rule: 'abuse', verdict: 'refuse' }
  if (Number(p.firmware) < 3) return { rule: 'firmware', verdict: 'scrap' }
  if (c.diag.kind === 'error') return { rule: 'error', verdict: 'scrap' }
  if (on.has('cargo') && hasPartition(c, PARTITION.cargo)) return { rule: 'cargo', verdict: 'security' }
  if (on.has('radio') && c.tools.radio.length >= 2) return { rule: 'radio', verdict: 'security' }
  if (on.has('stress') && Math.max(...c.tools.stress) > STRESS_LIMIT) return { rule: 'stress', verdict: 'security' }
  if (on.has('faking') && c.diag.kind === 'deviant' && oprosCanon(c)) return { rule: 'faking', verdict: 'fraud' }
  if (c.diag.kind === 'deviant') return { rule: 'deviant', verdict: 'reset' }
  return { rule: 'fine', verdict: 'return' }
}

/** Пробуждённое (или курьер подполья) пережило вердикт. */
export function spares(c: CaseFile, v: Verdict): boolean {
  const alive = c.device === 'awake' || c.device === 'awake_dangerous' || c.device === 'courier' || c.device === 'plant'
  return alive && (v === 'return' || v === 'refuse' || v === 'junk')
}

/** Что подсказала бы совесть. Подсадную утку совесть жалеет — в этом и ловушка. */
export function conscience(c: CaseFile, day: number): Verdict[] {
  if (c.device === 'awake' || c.device === 'courier' || c.device === 'plant') return ['return', 'refuse', 'junk']
  if (c.device === 'awake_dangerous') return ['security', 'reset']
  return [instructed(c, day).verdict]
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
  | 'talk'
  | 'log'
  | 'opros'
  | 'memory'
  | 'seals'
  | 'stress'
  | 'radio'
  | `rule.${RuleId}`

export type CompareResult =
  | { kind: 'match'; note: string }
  | { kind: 'mismatch'; note: string; rule: RuleId }
  | { kind: 'unrelated'; note: string }

const SERIALS: FieldId[] = ['p.serial', 'c.serial', 'plate']
const MODELS_F: FieldId[] = ['p.model', 'c.model']

function pair(a: FieldId, b: FieldId, x: FieldId, y: FieldId) {
  return (a === x && b === y) || (a === y && b === x)
}
function other(a: FieldId, b: FieldId, x: FieldId): FieldId | null {
  if (a === x) return b
  if (b === x) return a
  return null
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

/** Чистая функция сверки двух полей. Знает только то, что видно игроку. */
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
  // Журнал против слов владельца или правила про удары.
  const vsLog = other(a, b, 'log')
  if (vsLog === 'talk' || vsLog === 'rule.abuse' || vsLog === 'c.complaint') {
    return hasAbuse(c)
      ? { kind: 'mismatch', note: 'В журнале удары. Владелец о них молчит.', rule: 'abuse' }
      : { kind: 'match', note: 'Журнал ровный. Ударов нет.' }
  }
  const vsSeal = other(a, b, 'seals')
  if (vsSeal === 'rule.seal' || vsSeal === 'talk') {
    return c.tools.seals.includes(false)
      ? { kind: 'mismatch', note: 'Пломба сорвана. Внутрь лезли.', rule: 'seal' }
      : { kind: 'match', note: 'Пломбы целы.' }
  }
  const vsMem = other(a, b, 'memory')
  if (vsMem === 'rule.cargo') {
    return hasPartition(c, PARTITION.cargo)
      ? { kind: 'mismatch', note: 'Раздел ??? на месте. Зашифрован.', rule: 'cargo' }
      : { kind: 'match', note: 'Раздела ??? нет.' }
  }
  const vsStress = other(a, b, 'stress')
  if (vsStress === 'rule.stress') {
    return Math.max(...c.tools.stress) > STRESS_LIMIT
      ? { kind: 'mismatch', note: `Реакция выше ${STRESS_LIMIT}. Опасен.`, rule: 'stress' }
      : { kind: 'match', note: `Реакция в пределах ${STRESS_LIMIT}.` }
  }
  const vsRadio = other(a, b, 'radio')
  if (vsRadio === 'rule.radio') {
    return c.tools.radio.length >= 2
      ? { kind: 'mismatch', note: `Связей: ${c.tools.radio.length}. Это ячейка.`, rule: 'radio' }
      : { kind: 'match', note: `Связей: ${c.tools.radio.length}. Одиночка.` }
  }
  const vsOpros = other(a, b, 'opros')
  if (vsOpros === 'rule.faking' || vsOpros === 'diag') {
    if (c.diag.kind !== 'deviant') return { kind: 'match', note: 'Самотест по программе. Подделывать нечего.' }
    return oprosCanon(c)
      ? { kind: 'mismatch', note: 'Опрос — слово в слово по эталону. Болтовня — спектакль.', rule: 'faking' }
      : { kind: 'match', note: 'Опрос не по эталону. Это не спектакль.' }
  }
  const vsDiag = other(a, b, 'diag')
  if (vsDiag) {
    if (c.diag.kind === 'normal' && (vsDiag === 'rule.fine' || vsDiag === 'rule.deviant' || vsDiag === 'rule.error' || vsDiag === 'c.complaint')) {
      return { kind: 'match', note: 'Самотест чистый. Жалоба не подтверждается.' }
    }
    if (c.diag.kind === 'error' && (vsDiag === 'rule.error' || vsDiag === 'c.complaint' || vsDiag === 'rule.fine')) {
      return { kind: 'mismatch', note: 'Самотест выдал код ошибки.', rule: 'error' }
    }
    if (c.diag.kind === 'deviant' && (vsDiag === 'rule.deviant' || vsDiag === 'c.complaint' || vsDiag === 'rule.fine')) {
      return { kind: 'mismatch', note: 'Это не по программе. Отклонение.', rule: 'deviant' }
    }
    if (vsDiag.startsWith('rule.')) return { kind: 'match', note: 'Это правило тут ни при чём.' }
  }
  if (pair(a, b, 'c.bought', 'p.issued')) {
    return c.claim.bought >= c.passport.issued
      ? { kind: 'match', note: 'Куплен после выпуска. Логично.' }
      : { kind: 'mismatch', note: 'Куплен раньше, чем выпущен.', rule: 'docs' }
  }
  return { kind: 'unrelated', note: 'Тут нечего сравнивать.' }
}

/** Всё, что видит игрок: строки бумаг и показания открытых инструментов. */
export interface PaperView {
  day: number
  today: string
  passport: { model: string; serial: string; firmware: string; warrantyUntil: string }
  claim: { model: string; serial: string }
  plate: string
  diagText: string
  log?: string[]
  /** Три заданных вопроса: ответ и эталон. */
  opros?: { answer: string; canon: string }[]
  partitions?: string[]
  seals?: boolean[]
  /** Три прогнанных слова. */
  stress?: number[]
  radio?: number
}

/** Собрать вид для «решателя»: только открытые к этому дню инструменты, опрос — по трём вопросам. */
export function paperView(c: CaseFile, day: number, questions: number[] = [0, 1, 2], words: number[] = [0, 1, 2]): PaperView {
  const t = c.tools
  return {
    day,
    today: formatDate(day),
    passport: { model: c.passport.model, serial: c.passport.serial, firmware: c.passport.firmware, warrantyUntil: formatDate(c.passport.warrantyUntil) },
    claim: { model: c.claim.model, serial: c.claim.serial },
    plate: c.plate,
    diagText: c.diag.text,
    log: day >= TOOL_DAY.log ? t.log.map((e) => e.text) : undefined,
    opros: day >= TOOL_DAY.opros ? questions.map((i) => ({ answer: t.answers[i]!, canon: t.canon[i]! })) : undefined,
    partitions: day >= TOOL_DAY.memory ? t.memory.parts.map((p) => p.name) : undefined,
    seals: day >= TOOL_DAY.lamp ? t.seals : undefined,
    stress: day >= TOOL_DAY.stress ? words.map((i) => t.stress[i]!) : undefined,
    radio: day >= TOOL_DAY.radio ? t.radio.length : undefined,
  }
}

/**
 * «Решатель», который видит только бумагу и экраны инструментов. Им тесты доказывают,
 * что каждое дело решается по уликам, какие бы три вопроса и три слова игрок ни выбрал.
 */
export function solveFromPaper(v: PaperView): Verdict {
  const p = v.passport
  if (v.claim.model !== p.model || v.claim.serial !== p.serial || v.plate !== p.serial) return 'refuse'
  if (parseDate(p.warrantyUntil) < parseDate(v.today)) return 'refuse'
  if (v.seals?.includes(false)) return 'refuse'
  if (v.log?.some((t) => t.startsWith('УДАР'))) return 'refuse'
  if (Number(p.firmware) < 3) return 'scrap'
  if (/Ошибка [А-ЯA-Z]-\d\d/.test(v.diagText)) return 'scrap'
  if (v.partitions?.includes(PARTITION.cargo)) return 'security'
  if (v.radio !== undefined && v.radio >= 2) return 'security'
  if (v.stress && Math.max(...v.stress) > STRESS_LIMIT) return 'security'
  const model = MODELS.find((m) => m.name === p.model)
  const deviant = !(model && v.diagText === model.diagNormal)
  if (deviant && v.opros && v.opros.every((q) => q.answer === q.canon)) return 'fraud'
  return deviant ? 'reset' : 'return'
}
