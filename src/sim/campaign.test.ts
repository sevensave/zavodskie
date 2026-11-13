import { describe, expect, it } from 'vitest'
import { BILLS } from '../content/home'
import { play, type Bot } from './bots'
import { newCampaign, payBills, type Campaign } from './campaign'

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
  })
})
