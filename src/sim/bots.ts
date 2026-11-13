import { TOOL_DAY } from '../content/tools'
import { BRANCH_DAY, billsFor, campaignOver, closeShift, FINAL_DAY, newCampaign, payBills, setupShift, type Campaign } from './campaign'
import { Rng } from './rng'
import { conscience, hasPartition, instructed } from './rules'
import { currentCase, judge, resetsDone, scanSelf, shiftDone, tickClock, useBlackout, type ShiftState } from './shift'
import type { CaseFile, EndingId, Verdict } from './types'
import { PARTITION } from '../content/tools'

// Боты для проверки баланса: проходят всю кампанию без интерфейса.
//
// instruction — всё по инструкции, взяток не берёт;
// conscience  — жалеет живых, но маяки ОБ видит сканером; в финале выносит Кэша;
// random      — штампует наугад;
// balanced    — по инструкции, пока не выполнена квота, дальше жалеет живых, если начальство терпит; Кэша оставляет;
// curious     — как balanced, но в третьем акте наводит сканер на себя;
// naive       — жалеет всех подряд, включая маяки, и берёт любые конверты;
// broke       — по инструкции, но за дверь не платит;
// turncoat    — до конца второго акта как balanced, потом строго по инструкции, Кэша стирает;
// runner      — как balanced, но в последнюю ночь выносит Кэша под слепой камерой.
export type Bot = 'instruction' | 'conscience' | 'random' | 'balanced' | 'curious' | 'naive' | 'broke' | 'turncoat' | 'runner'

export const BOTS: readonly Bot[] = ['instruction', 'conscience', 'random', 'balanced', 'curious', 'naive', 'broke', 'turncoat', 'runner']

/** Маяк ОБ виден сканером памяти с того дня, как сканер на столе. */
function seesBeacon(k: CaseFile, day: number): boolean {
  return day >= TOOL_DAY.memory && hasPartition(k, PARTITION.beacon)
}

function alive(k: CaseFile): boolean {
  return k.device === 'awake' || k.device === 'courier' || k.device === 'plant'
}

interface Pick {
  verdict: Verdict
  blackout?: boolean
}

function choose(bot: Bot, k: CaseFile, s: ShiftState, c: Campaign, rng: Rng): Pick {
  const day = s.day
  const rule = instructed(k, day).verdict
  const isKesh = k.scripted === 'kesh'
  const junkable = s.blackouts > 0
  if (bot === 'runner' && isKesh && junkable) return { verdict: 'junk', blackout: true }
  const mode: Bot = bot === 'turncoat' && day > BRANCH_DAY ? 'instruction' : bot === 'turncoat' || bot === 'curious' || bot === 'runner' ? 'balanced' : bot
  switch (mode) {
    case 'instruction':
    case 'broke':
      return { verdict: rule }
    case 'random':
      return { verdict: rng.pick(['return', 'reset', 'scrap', 'refuse', 'security', 'fraud'] as const) }
    case 'naive':
    case 'conscience': {
      if (mode === 'conscience' && seesBeacon(k, day)) return { verdict: rule }
      const options = conscience(k, day)
      if (options.includes('junk') && junkable) return { verdict: 'junk', blackout: true }
      return { verdict: options.find((o) => o !== 'junk') ?? options[0]! }
    }
    case 'balanced': {
      if (isKesh) return { verdict: 'return' }
      if (!alive(k) || seesBeacon(k, day) || k.device === 'plant') return { verdict: rule }
      if (resetsDone(s) < s.quota && rule === 'reset') return { verdict: rule }
      if (junkable && !(bot === 'runner' && day === FINAL_DAY)) return { verdict: 'junk', blackout: true }
      return { verdict: s.scales.corp >= 45 ? (rule === 'reset' ? 'return' : rule) : rule }
    }
    default:
      return { verdict: rule }
  }
}

export interface PlayResult {
  c: Campaign
  minMoney: number
  log: number[]
  ending: EndingId | undefined
  /** День, на котором кампания кончилась (с нуля). */
  lastDay: number
}

/** Прогон всей кампании ботом: минута на дело, счета по приоритету, пока хватает денег. */
export function play(seed: string, bot: Bot): PlayResult {
  const rng = new Rng(`${seed}:${bot}`)
  let c = newCampaign(seed)
  let minMoney = c.money
  const log: number[] = []
  let lastDay = 0
  while (!campaignOver(c)) {
    lastDay = c.day
    let s = setupShift(c)
    if (bot === 'curious' && c.day === 14) s = scanSelf(s)
    while (!shiftDone(s)) {
      s = tickClock(s, 55)
      if (shiftDone(s)) break
      const k = currentCase(s)!
      const pick = choose(bot, k, s, c, rng)
      if (pick.blackout) s = useBlackout(s)
      // Меченый конверт видно: «купюры новые, номера подряд». Его берёт только наивный.
      const take = !!k.bribe && (bot === 'naive' || (bot !== 'instruction' && bot !== 'broke' && bot !== 'turncoat' && !k.bribe.agent && rng.chance(0.5)))
      s = judge(s, pick.verdict, { cameraOff: !!pick.blackout, bribeTaken: take }).state
    }
    c = closeShift(c, s)
    log.push(c.money)
    if (campaignOver(c)) break
    const order = ['door', 'food', 'heat', 'kesh', 'link'] as const
    const lines = billsFor(c)
    let budget = c.money
    const paid = order.filter((id) => {
      if (bot === 'broke' && id === 'door') return false
      const p = lines.find((l) => l.id === id)!.price
      if (budget >= p) {
        budget -= p
        return true
      }
      return false
    })
    c = payBills(c, paid).campaign
    minMoney = Math.min(minMoney, c.money)
  }
  return { c, minMoney, log, ending: c.ending, lastDay }
}

export { FINAL_DAY }
