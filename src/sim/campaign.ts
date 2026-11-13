import { CLIFF_POOL, CLIFFHANGERS, type Cliffhanger } from '../content/cash'
import { storyCliff, storyNews } from '../content/chronicle'
import { BILLS, billMarkup, type BillId } from '../content/home'
import { NEWS, type NewsCondition, type NewsItem } from '../content/news'
import { CORP_FLOOR, earlyEnding, finalEnding } from './endings'
import { Rng } from './rng'
import { shift1Scripted } from './scripted'
import { blackoutsFor, casesForDay, startShift, summarize, type ShiftState, type ShiftSummary } from './shift'
import { storyFor } from './story'
import type { Branch, EndingId, KeshTruth, RegularId, Scales, StoryCtx, Verdict } from './types'

export const CAMPAIGN_DAYS = 21
/** 3: сюжет, ветка третьего акта, агент среди постоянных, концовки. */
export const SAVE_VERSION = 3
/** Последняя смена (с нуля): на ней к окну приносят Кэша. */
export const FINAL_DAY = CAMPAIGN_DAYS - 1
/** После этой смены решается, чья будет стойка в третьем акте. */
export const BRANCH_DAY = 13
/** С этой смены под машинами к окну приводят людей. */
export const HUMANS_DAY = 16

export type { KeshTruth } from './types'

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
  phase: 'shift' | 'home' | 'ending'
  money: number
  scales: Omit<Scales, 'money'>
  heat: number
  /** Скрытая правда забега: кто такой Кэш. Узнаётся по уликам в третьем акте. */
  kesh: KeshTruth
  /** Скрытая правда забега: кто из постоянных посетителей — агент ОБ. */
  agent: RegularId
  /** Чья стойка в третьем акте; решается после 14-й смены. */
  branch: Branch | null
  /** Штампы сюжетных дел по ключу. */
  story: Record<string, Verdict>
  /** Сколько раз приёмщик попался ОБ. Три — арест. */
  strikes: number
  ending?: EndingId
  /** Сколько вечеров подряд не плачено по каждому счёту. */
  unpaid: Record<BillId, number>
  history: DayRecord[]
  /** Отчёт последней смены — для вечера и газеты. */
  last?: ShiftReport
  flags: Record<string, boolean>
  /** «Вторая смена» (новая игра+): 1 — идёт повторный забег. */
  plus?: number
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

/** Во «Второй смене» на сколько сбросов квота жёстче. */
export const PLUS_QUOTA = 1

/**
 * Новая кампания. plus — «Вторая смена»: обучение уже пройдено, забег начинается со второй ночи,
 * все инструменты на столе с первого дня, квоты жёстче, приходят новые сюжетные дела.
 */
export function newCampaign(seed: string, plus = 0): Campaign {
  const rng = new Rng(`${seed}:kesh`)
  return {
    v: SAVE_VERSION,
    seed,
    day: plus ? 1 : 0,
    phase: 'shift',
    money: plus ? 40 : 30,
    scales: { corp: 50, under: 0, alarm: 10 },
    heat: 0,
    kesh: rng.pick(['sincere', 'provocateur', 'manipulator'] as const),
    agent: new Rng(`${seed}:agent`).pick(['somov', 'lykova', 'kovalchuk'] as const),
    branch: null,
    story: {},
    strikes: 0,
    unpaid: { door: 0, heat: 0, food: 0, link: 0, kesh: 0 },
    history: [],
    flags: plus ? { plus: true } : {},
    ...(plus ? { plus } : {}),
  }
}

/** Темп часов: простуда и голод отнимают время у смены. */
export function paceFor(c: Campaign): number {
  let p = 1
  if (c.unpaid.heat >= 2) p += 0.1
  if (c.unpaid.food >= 2) p += 0.1
  return p
}

export function storyCtx(c: Campaign): StoryCtx {
  return { kesh: c.kesh, agent: c.agent, branch: c.branch, verdicts: c.story, flags: c.flags }
}

/** Кого ведут к окну: под машинами в конце третьего акта — людей. */
export function humansFor(c: Campaign): 'none' | 'half' | 'all' {
  if (c.branch !== 'machines' || c.day < HUMANS_DAY) return 'none'
  return c.day === HUMANS_DAY ? 'half' : 'all'
}

export function setupShift(c: Campaign): ShiftState {
  const scripted = c.day === 0 ? shift1Scripted() : []
  const final = c.day === FINAL_DAY
  return startShift(`${c.seed}:${c.day}`, c.day, scripted, casesForDay(c.day), {
    scales: { money: 0, ...c.scales },
    heat: c.heat,
    pace: paceFor(c),
    // В последнюю ночь Кэш слепит камеру сам, сколько бы ему ни доверяли.
    blackouts: c.day === 0 ? 0 : blackoutsFor(c.scales.under) + (final ? 1 : 0),
    story: c.day === 0 ? [] : storyFor(c.day, storyCtx(c)),
    humans: humansFor(c),
    endOnLast: final,
    toolsDay: c.plus ? FINAL_DAY : c.day,
    quotaBonus: c.plus ? PLUS_QUOTA : 0,
  })
}

/** Ветка третьего акта: если подполье сильно или город на грани — стойку займут машины. */
export function decideBranch(sc: Omit<Scales, 'money'>): Branch {
  return sc.under >= 50 || sc.alarm >= 70 ? 'machines' : 'corp'
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

function pickCliff(s: ShiftState, sum: ShiftSummary, quotaMet: boolean, aud: Audit, rng: Rng, x: StoryCtx): Cliffhanger {
  const story = s.day === 0 ? null : storyCliff(s.day, x)
  if (story) return story
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

/** Заранее о концовке: вместо обычного клиффхэнгера. */
const ENDING_CLIFFS: Partial<Record<EndingId, Cliffhanger>> = {
  utilized: { kind: 'phone', title: 'ЗВОНОК В 06:02', lines: ['— Отдел кадров. Завтра можете не приходить.', '— И послезавтра.', '— Пропуск оставьте на стойке. Он вас больше не узнает.'] },
  arrest: { kind: 'phone', title: 'ЗВОНОК В 06:04', lines: ['— Майор Гречко. Не вешайте трубку.', '— Не уходите со смены.', '— Мы уже поднимаемся.'] },
}

const FINAL_CLIFF: Cliffhanger = {
  kind: 'note',
  title: '06:00 · ПОСЛЕДНЯЯ СМЕНА',
  lines: ['Очередь кончилась.', 'Часы над окном остановились на шести.', 'Дальше — без бланков.'],
}

/** Закрыть смену: деньги, квота, ревизия, газета на утро, сюжет и концовки. */
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
  const verdicts: Partial<Record<Verdict, number>> = {}
  for (const r of s.results) verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1
  const story = { ...c.story }
  for (const r of s.results) {
    const k = s.queue.find((q) => q.id === r.caseId)?.scripted
    if (k) story[k] = r.verdict
  }
  const clamp = (v: number) => Math.max(0, Math.min(100, v))
  const scales = {
    corp: clamp(s.scales.corp + (quotaMet ? 3 : s.quota ? -8 : 0) + aud.corp),
    under: s.scales.under,
    alarm: clamp(s.scales.alarm + (c.day >= 14 ? 3 : c.day >= 7 ? 1 : 0)),
  }
  // Попался ОБ: меченый конверт, пожалел маяк, отдал маяк подполью.
  const strikes = c.strikes + (s.flags.agentBribe ? 1 : 0) + (s.flags.plantSpared ? 1 : 0) + (s.flags.plantJunk ? 1 : 0)
  const flags = { ...c.flags }
  if (s.flags.plantJunk) flags.cellBurned = true
  if (s.flags.selfScan) flags.selfScan = true
  // Доверие ниже черты: первый раз — предупреждение, второй подряд — увольнение.
  if (c.day > 0 && scales.corp < CORP_FLOOR) {
    if (flags.corpWarned) flags.fired = true
    flags.corpWarned = true
  } else flags.corpWarned = false
  const branch = c.branch ?? (c.day === BRANCH_DAY ? decideBranch(scales) : null)

  const next: Campaign = {
    ...c,
    phase: 'home',
    money: c.money + income,
    scales,
    heat: Math.max(0, s.heat - 10 + (aud.happened ? -15 : 0)),
    history: [...c.history, { day: s.day, summary: sum, quotaMet, audit: aud, verdicts }],
    flags,
    story,
    strikes,
    branch,
  }
  const ending = earlyEnding(next) ?? (c.day >= FINAL_DAY ? finalEnding(next, story.kesh) : null)
  const x = storyCtx(next)
  const headline = storyNews(s.day, x)
  const news = [headline ?? rng.pick(NEWS.filter((n) => n.when === first)), rng.pick(NEWS.filter((n) => n.when === (headline ? first : second)))]
  const cliff = c.day >= FINAL_DAY ? FINAL_CLIFF : (ending && ENDING_CLIFFS[ending]) || pickCliff(s, sum, quotaMet, aud, rng, x)
  const report: ShiftReport = { day: s.day, summary: sum, quotaMet, quotaDelta, audit: aud, income, news, cliff }
  return { ...next, last: report, ...(ending ? { phase: 'ending' as const, ending } : {}) }
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
  let strikes = c.strikes
  for (const b of lines) {
    const bill = BILLS.find((x) => x.id === b.id)!
    if (paid.includes(b.id) && money >= b.price) {
      money -= b.price
      unpaid[b.id] = 0
    } else {
      unpaid[b.id] += 1
      events.push(unpaid[b.id] >= 2 ? bill.unpaidTwice : bill.unpaid)
      if (unpaid[b.id] >= 2 && b.id === 'door') flags.evicted = true
      if (unpaid[b.id] >= 2 && b.id === 'kesh' && !flags.keshFound) {
        flags.keshFound = true
        strikes += 1
      }
    }
  }
  const next: Campaign = { ...c, money, unpaid, flags, strikes, day: c.day + 1, phase: 'shift' }
  const ending = earlyEnding(next)
  return { campaign: ending ? { ...next, phase: 'ending', ending } : next, events }
}

/** Кампания кончилась: концовка наступила (после 21-й смены или раньше). */
export function campaignOver(c: Campaign): boolean {
  return c.phase === 'ending' || c.day >= CAMPAIGN_DAYS
}
