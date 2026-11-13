import { describe, expect, it } from 'vitest'
import { BOTS, play } from './bots'
import type { EndingId } from './types'

// Сводка баланса: по 150 кампаний на бота (BALANCE_N — сколько угодно, `npm run balance` — тысяча).
// Гоняет и обычную кампанию, и «Вторую смену». Печатает таблицу и концовки, проверяет,
// что экономика не ломается (кошелёк не уходит в минус, работник по инструкции не остаётся без дома)
// и что достижимы все девять концовок.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const N = Number(env.BALANCE_N ?? 150)

describe('баланс', () => {
  it('сводка по ботам и все концовки достижимы', { timeout: 1_800_000 }, () => {
    const rows: string[] = []
    const seen = new Set<EndingId>()
    let broke = 0
    for (const plus of [0, 1]) {
      rows.push(plus ? '--- вторая смена ---' : '--- кампания ---')
      for (const bot of BOTS) {
        let money = 0
        let corp = 0
        let under = 0
        let alarm = 0
        let days = 0
        let machines = 0
        let low = Infinity
        const ends: Partial<Record<EndingId, number>> = {}
        for (let i = 0; i < N; i++) {
          const r = play(`bal${i}`, bot, plus)
          const c = r.c
          money += c.money
          corp += c.scales.corp
          under += c.scales.under
          alarm += c.scales.alarm
          days += r.lastDay + 1
          low = Math.min(low, r.minMoney)
          if (r.minMoney < 0) broke++
          if (c.branch === 'machines') machines++
          if (r.ending) {
            ends[r.ending] = (ends[r.ending] ?? 0) + 1
            seen.add(r.ending)
          }
          if (bot === 'instruction') expect(r.ending, `${bot} bal${i} plus=${plus}`).not.toBe('evicted')
        }
        const e = Object.entries(ends)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')
        rows.push(
          `${bot.padEnd(11)} смен ${(days / N).toFixed(1).padStart(4)}  деньги ${(money / N).toFixed(0).padStart(4)} (мин ${String(low).padStart(3)})  корп ${(corp / N).toFixed(0).padStart(3)}  подп ${(under / N).toFixed(0).padStart(3)}  трев ${(alarm / N).toFixed(0).padStart(3)}  машины ${String(machines).padStart(4)}  | ${e}`,
        )
      }
    }
    console.log(`Баланс: по ${N} кампаний на бота\n${rows.join('\n')}`)
    expect(broke).toBe(0)
    expect([...seen].sort()).toEqual(['arrest', 'betrayed', 'employee', 'escape', 'evicted', 'secret', 'truce', 'useful', 'utilized'])
  })
})
