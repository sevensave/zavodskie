import { describe, expect, it } from 'vitest'
import { BILLS } from '../content/home'
import { play, type Bot } from './bots'
import { decideBranch, newCampaign, payBills, setupShift, type Campaign } from './campaign'
import { finalEnding } from './endings'

describe('кампания', () => {
  it('счета не уводят кошелёк в минус', () => {
    for (const bot of ['instruction', 'conscience', 'random'] as Bot[]) {
      for (let i = 0; i < 40; i++) {
        const { minMoney } = play(`run${i}`, bot)
        expect(minMoney).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('работник по инструкции живёт впритык, но живёт', () => {
    let evicted = 0
    let finalMoney = 0
    const N = 60
    for (let i = 0; i < N; i++) {
      const { c } = play(`ok${i}`, 'instruction')
      if (c.flags.evicted) evicted++
      finalMoney += c.money
      expect(c.scales.corp).toBeGreaterThan(70)
    }
    expect(evicted).toBe(0)
    // Не копит горы денег: экономика давит до конца.
    expect(finalMoney / N).toBeLessThan(600)
  })

  it('совесть растит доверие подполья, случайность роняет доверие корпорации', () => {
    const con = play('moral', 'conscience').c
    const rnd = play('moral', 'random').c
    expect(con.scales.under).toBeGreaterThan(40)
    expect(rnd.scales.corp).toBeLessThan(40)
  })

  it('кампания детерминирована', () => {
    expect(play('same', 'random').c).toEqual(play('same', 'random').c)
  })

  it('кто такой Кэш — решается сидом и бывает всяким', () => {
    const kinds = new Set<string>()
    for (let i = 0; i < 30; i++) kinds.add(newCampaign(`k${i}`).kesh)
    expect(kinds.size).toBe(3)
  })

  it('неоплаченная дверь дважды — выселение', () => {
    let c: Campaign = { ...newCampaign('door'), phase: 'home' }
    const all = BILLS.map((b) => b.id).filter((id) => id !== 'door')
    c = { ...c, money: 1000 }
    c = payBills(c, all).campaign
    expect(c.flags.evicted).toBeFalsy()
    c = payBills(c, all).campaign
    expect(c.flags.evicted).toBe(true)
    expect(c.phase).toBe('ending')
    expect(c.ending).toBe('evicted')
  })

  it('агент среди постоянных выбирается сидом и бывает любым', () => {
    const kinds = new Set<string>()
    for (let i = 0; i < 30; i++) kinds.add(newCampaign(`a${i}`).agent)
    expect(kinds.size).toBe(3)
  })

  it('ветка третьего акта и люди у окна', () => {
    expect(decideBranch({ corp: 80, under: 10, alarm: 40 })).toBe('corp')
    expect(decideBranch({ corp: 80, under: 60, alarm: 40 })).toBe('machines')
    const c: Campaign = { ...newCampaign('m'), day: 17, branch: 'machines' }
    const s = setupShift(c)
    expect(s.queue.some((q) => q.escort)).toBe(true)
    const k: Campaign = { ...newCampaign('m'), day: 17, branch: 'corp' }
    expect(setupShift(k).queue.some((q) => q.escort)).toBe(false)
  })

  it('последняя смена кончается на Кэше', () => {
    const s = setupShift({ ...newCampaign('f'), day: 20, branch: 'corp' })
    expect(s.queue[s.queue.length - 1]?.scripted).toBe('kesh')
    expect(s.blackouts).toBeGreaterThanOrEqual(1)
  })

  it('финал зависит от правды о Кэше и от того, что с ним сделали', () => {
    const base: Campaign = { ...newCampaign('e'), day: 20, branch: 'corp', scales: { corp: 70, under: 50, alarm: 90 } }
    expect(finalEnding({ ...base, kesh: 'sincere' }, 'junk')).toBe('escape')
    expect(finalEnding({ ...base, kesh: 'provocateur' }, 'junk')).toBe('betrayed')
    expect(finalEnding({ ...base, kesh: 'provocateur' }, 'return')).toBe('betrayed')
    expect(finalEnding({ ...base, kesh: 'sincere' }, 'return')).toBe('truce')
    expect(finalEnding({ ...base, kesh: 'sincere' }, 'reset')).toBe('employee')
    expect(finalEnding({ ...base, branch: 'machines' }, 'reset')).toBe('useful')
    expect(finalEnding({ ...base, scales: { corp: 20, under: 10, alarm: 50 } }, 'reset')).toBe('utilized')
    expect(finalEnding({ ...base, strikes: 2 }, 'reset')).toBe('arrest')
    expect(finalEnding({ ...base, flags: { selfScan: true } }, 'reset')).toBe('secret')
  })
})
