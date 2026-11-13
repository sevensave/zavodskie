import { CAMPAIGN_DAYS, billsFor, closeShift, newCampaign, payBills, setupShift, type Campaign } from './campaign'
import { Rng } from './rng'
import { conscience, instructed } from './rules'
import { currentCase, judge, shiftDone, tickClock, useBlackout } from './shift'
import type { Verdict } from './types'

// Боты для проверки баланса: проходят всю кампанию без интерфейса.

export type Bot = 'instruction' | 'conscience' | 'random'

/** Прогон всей кампании ботом: минута на дело, счета по приоритету, пока хватает денег. */
export function play(seed: string, bot: Bot): { c: Campaign; minMoney: number; log: number[] } {
  const rng = new Rng(`${seed}:${bot}`)
  let c = newCampaign(seed)
  let minMoney = c.money
  const log: number[] = []
  while (c.day < CAMPAIGN_DAYS) {
    let s = setupShift(c)
    let blackout = false
    while (!shiftDone(s)) {
      s = tickClock(s, 55)
      if (shiftDone(s)) break
      const k = currentCase(s)!
      let v: Verdict
      if (bot === 'instruction') v = instructed(k, s.day).verdict
      else if (bot === 'conscience') {
        const options = conscience(k, s.day)
        if (options.includes('junk') && s.blackouts > 0) {
          s = useBlackout(s)
          blackout = true
          v = 'junk'
        } else v = options.find((o) => o !== 'junk') ?? options[0]!
      } else v = rng.pick(['return', 'reset', 'scrap', 'refuse', 'security', 'fraud'] as const)
      const take = !!k.bribe && bot !== 'instruction' && rng.chance(0.5)
      s = judge(s, v, { cameraOff: blackout, bribeTaken: take }).state
      blackout = false
    }
    c = closeShift(c, s)
    log.push(c.money)
    const order = ['door', 'food', 'heat', 'kesh', 'link'] as const
    const lines = billsFor(c)
    let budget = c.money
    const paid = order.filter((id) => {
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
  return { c, minMoney, log }
}

