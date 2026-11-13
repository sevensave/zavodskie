import { describe, expect, it } from 'vitest'
import { BOTS, play } from './bots'
import type { EndingId } from './types'

// Сводка баланса: по 150 кампаний на бота. Печатает таблицу и концовки, проверяет, что достижимы все девять.
describe('баланс', () => {
  it('сводка по ботам и все концовки достижимы', () => {
    const rows: string[] = []
    const seen = new Set<EndingId>()
    const N = 150
    for (const bot of BOTS) {
      let money = 0
      let corp = 0
      let under = 0
      let alarm = 0
      let days = 0
      let machines = 0
      const ends: Partial<Record<EndingId, number>> = {}
      for (let i = 0; i < N; i++) {
        const r = play(`bal${i}`, bot)
        const c = r.c
        money += c.money
        corp += c.scales.corp
        under += c.scales.under
        alarm += c.scales.alarm
        days += r.lastDay + 1
        if (c.branch === 'machines') machines++
        if (r.ending) {
          ends[r.ending] = (ends[r.ending] ?? 0) + 1
          seen.add(r.ending)
        }
      }
      const e = Object.entries(ends)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')
      rows.push(
        `${bot.padEnd(11)} смен ${(days / N).toFixed(1).padStart(4)}  деньги ${(money / N).toFixed(0).padStart(4)}  корп ${(corp / N).toFixed(0).padStart(3)}  подп ${(under / N).toFixed(0).padStart(3)}  трев ${(alarm / N).toFixed(0).padStart(3)}  машины ${String(machines).padStart(3)}  | ${e}`,
      )
    }
    console.log(rows.join('\n'))
    expect([...seen].sort()).toEqual(['arrest', 'betrayed', 'employee', 'escape', 'evicted', 'secret', 'truce', 'useful', 'utilized'])
  })
})
