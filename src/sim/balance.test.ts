import { describe, expect, it } from 'vitest'
import { play, type Bot } from './bots'

// Сводка баланса: по 200 кампаний на бота. Печатает таблицу, проверяет грубые рамки.
describe('баланс', () => {
  it('сводка по ботам', () => {
    const rows: string[] = []
    for (const bot of ['instruction', 'conscience', 'random'] as Bot[]) {
      let money = 0
      let corp = 0
      let under = 0
      let alarm = 0
      let evicted = 0
      let kesh = 0
      const N = 200
      for (let i = 0; i < N; i++) {
        const { c } = play(`bal${i}`, bot)
        money += c.money
        corp += c.scales.corp
        under += c.scales.under
        alarm += c.scales.alarm
        if (c.flags.evicted) evicted++
        if (c.flags.keshFound) kesh++
      }
      rows.push(`${bot.padEnd(12)} деньги ${(money / N).toFixed(0).padStart(5)}  корп ${(corp / N).toFixed(0).padStart(3)}  подп ${(under / N).toFixed(0).padStart(3)}  тревога ${(alarm / N).toFixed(0).padStart(3)}  выселен ${evicted}  Кэш найден ${kesh}`)
    }
    console.log(rows.join('\n'))
    expect(rows).toHaveLength(3)
  })
})
