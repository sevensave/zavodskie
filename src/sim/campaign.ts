import { CLIFF_POOL, CLIFFHANGERS, type Cliffhanger } from '../content/cash'
import { BILLS, billMarkup, type BillId } from '../content/home'
import { NEWS, type NewsCondition, type NewsItem } from '../content/news'
import { Rng } from './rng'
import { shift1Scripted } from './scripted'
import { blackoutsFor, casesForDay, startShift, summarize, type ShiftState, type ShiftSummary } from './shift'
import type { Scales, Verdict } from './types'

export const CAMPAIGN_DAYS = 21
export const SAVE_VERSION = 2

export type KeshTruth = 'sincere' | 'provocateur' | 'manipulator'

export interface DayRecord {
  day: number
  summary: ShiftSummary
  quotaMet: boolean
  audit: Audit
  verdicts: Partial<Record<Verdict, number>>
}

export interface Audit {
  happened: boolean
  fine: number
  corp: number
  text: string
}

export interface Campaign {
  v: number
  seed: string
  /** Номер ближайшей (или идущей) смены, 0 — первая. */
  day: number
  phase: 'shift' | 'home'
  money: number
  scales: Omit<Scales, 'money'>
  heat: number
  /** Скрытая правда забега: кто такой Кэш. Узнаётся по уликам в третьем акте. */
  kesh: KeshTruth
  /** Сколько вечеров подряд не плачено по каждому счёту. */
  unpaid: Record<BillId, number>
  history: DayRecord[]
  /** Отчёт последней смены — для вечера и газеты. */
  last?: ShiftReport
  flags: Record<string, boolean>
}

export interface ShiftReport {
  day: number
  summary: ShiftSummary
  quotaMet: boolean
  quotaDelta: number
  audit: Audit
  income: number
  news: NewsItem[]
  cliff: Cliffhanger
}

export function newCampaign(seed: string): Campaign {
  const rng = new Rng(`${seed}:kesh`)
  return {
    v: SAVE_VERSION,
    seed,
    day: 0,
    phase: 'shift',
    money: 30,
    scales: { corp: 50, under: 0, alarm: 10 },
    heat: 0,
    kesh: rng.pick(['sincere', 'provocateur', 'manipulator'] as const),
    unpaid: { door: 0, heat: 0, food: 0, link: 0, kesh: 0 },
    history: [],
    flags: {},
  }
}

/** Темп часов: простуда и голод отнимают время у смены. */
export function paceFor(c: Campaign): number {
  let p = 1
  if (c.unpaid.heat >= 2) p += 0.1
  if (c.unpaid.food >= 2) p += 0.1
  return p
}

export function setupShift(c: Campaign): ShiftState {
  const scripted = c.day === 0 ? shift1Scripted() : []
  return startShift(`${c.seed}:${c.day}`, c.day, scripted, casesForDay(c.day), {
    scales: { money: 0, ...c.scales },
    heat: c.heat,
    pace: paceFor(c),
    blackouts: c.day === 0 ? 0 : blackoutsFor(c.scales.under),
  })
}

const QUOTA_BONUS = 15

function audit(s: ShiftState, rng: Rng): Audit {
  const junk = s.results.filter((r) => r.verdict === 'junk').length
  if (s.flags.agentBribe) {
    return { happened: true, fine: 50, corp: -20, text: 'Ревизия: конверт был меченый. Штраф 50 р.' }
  }
  if (s.flags.plantSpared) {
    return { happened: true, fine: 30, corp: -10, text: 'Ревизия: проверочный прибор ОБ отпущен домой. Штраф 30 р.' }
  }
  if (rng.chance(Math.min(0.9, s.heat / 100))) {
    if (junk >= 2) return { happened: true, fine: 20, corp: -10, text: `Ревизия: ${junk} прибора списаны в лом. Слишком много. Штраф 20 р.` }
    if (s.warnings > 2) return { happened: true, fine: 10, corp: -5, text: 'Ревизия: ошибок больше нормы. Штраф 10 р.' }
    return { happened: true, fine: 0, corp: 2, text: 'Ревизия: нарушений не найдено. Пока.' }
  }
  return { happened: false, fine: 0, corp: 0, text: '' }
}

function newsConditions(s: ShiftState, sum: ShiftSummary, quotaMet: boolean): NewsCondition[] {
  const out: NewsCondition[] = []
  const count = (v: Verdict) => s.results.filter((r) => r.verdict === v).length
  if (s.flags.plantSpared) out.push('plant_spared')
  if (sum.junk > 0) out.push('junk_any')
  if (sum.spared >= 3) out.push('spared_many')
  if (count('reset') >= 3) out.push('reset_many')
  if (count('security') >= 2) out.push('security_many')
  if (count('scrap') >= 3) out.push('scrap_many')
  if (!quotaMet) out.push('quota_failed')
  if (s.scales.alarm >= 50) out.push('alarm_high')
  if (s.scales.alarm < 20) out.push('alarm_low')
  out.push('calm')
  return out
}

function pickCliff(s: ShiftState, sum: ShiftSummary, quotaMet: boolean, aud: Audit, rng: Rng): Cliffhanger {
  if (s.day === 0) {
    const metla = s.results.find((r) => r.caseId === '0-metla')
    if (metla?.verdict === 'junk') return CLIFFHANGERS.junk
    if (metla?.verdict === 'reset') return CLIFFHANGERS.reset
    return CLIFFHANGERS.other
  }
  const keys: (typeof CLIFF_POOL)[number]['when'][] = []
  if (sum.junk > 0) keys.push('junk')
  if (aud.happened) keys.push('audit')
  if (sum.bribes > 0) keys.push('bribe')
  if (!quotaMet) keys.push('quota')
  if (sum.spared >= 2) keys.push('spared')
  keys.push('any')
  const want = keys[0]!
  return rng.pick(CLIFF_POOL.filter((x) => x.when === want))
}

/** Закрыть смену: деньги, квота, ревизия, газета на утро. */
export function closeShift(c: Campaign, s: ShiftState): Campaign {
  const rng = new Rng(`${c.seed}:${c.day}:close`)
  const sum = summarize(s)
  const quotaMet = sum.resets >= s.quota
  const quotaDelta = s.quota === 0 ? 0 : quotaMet ? QUOTA_BONUS : -QUOTA_BONUS
  const aud = audit(s, rng)
  const income = s.scales.money + quotaDelta - aud.fine
  const conds = newsConditions(s, sum, quotaMet)
  const first = conds[0]!
  const second = conds.find((x) => x !== first) ?? 'calm'
  const news = [rng.pick(NEWS.filter((n) => n.when === first)), rng.pick(NEWS.filter((n) => n.when === second))]
  const report: ShiftReport = {
    day: s.day,
    summary: sum,
    quotaMet,
    quotaDelta,
    audit: aud,
    income,
    news,
    cliff: pickCliff(s, sum, quotaMet, aud, rng),
  }
  const verdicts: Partial<Record<Verdict, number>> = {}
  for (const r of s.results) verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1
  const clamp = (v: number) => Math.max(0, Math.min(100, v))
  return {
    ...c,
    phase: 'home',
    money: c.money + income,
    scales: {
      corp: clamp(s.scales.corp + (quotaMet ? 3 : s.quota ? -8 : 0) + aud.corp),
      under: s.scales.under,
      alarm: clamp(s.scales.alarm + (c.day >= 14 ? 3 : c.day >= 7 ? 1 : 0)),
    },
    heat: Math.max(0, s.heat - 10 + (aud.happened ? -15 : 0)),
    history: [...c.history, { day: s.day, summary: sum, quotaMet, audit: aud, verdicts }],
    last: report,
    flags: { ...c.flags, ...(s.flags.plantJunk ? { cellBurned: true } : {}) },
  }
}

export interface BillLine {
  id: BillId
  name: string
  price: number
  unpaid: number
}

export function billsFor(c: Campaign): BillLine[] {
  const m = billMarkup(c.day)
  return BILLS.map((b) => ({ id: b.id, name: b.name, price: b.price + (b.id === 'link' ? 0 : m), unpaid: c.unpaid[b.id] }))
}

/** Оплатить выбранные счета и уйти на следующую смену. Возвращает, что случилось дома. */
export function payBills(c: Campaign, paid: readonly BillId[]): { campaign: Campaign; events: string[] } {
  const lines = billsFor(c)
  let money = c.money
  const unpaid = { ...c.unpaid }
  const events: string[] = []
  const flags = { ...c.flags }
  for (const b of lines) {
    const bill = BILLS.find((x) => x.id === b.id)!
    if (paid.includes(b.id) && money >= b.price) {
      money -= b.price
      unpaid[b.id] = 0
    } else {
      unpaid[b.id] += 1
      events.push(unpaid[b.id] >= 2 ? bill.unpaidTwice : bill.unpaid)
      if (unpaid[b.id] >= 2 && b.id === 'door') flags.evicted = true
      if (unpaid[b.id] >= 2 && b.id === 'kesh') flags.keshFound = true
    }
  }
  return { campaign: { ...c, money, unpaid, flags, day: c.day + 1, phase: 'shift' }, events }
}

/** Кампания кончилась: 21 смена позади или жизнь вынесла приговор раньше. Концовки — этап 4. */
export function campaignOver(c: Campaign): boolean {
  return c.day >= CAMPAIGN_DAYS
}
