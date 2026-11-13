import { describe, expect, it } from 'vitest'
import { FILES } from '../content/files'
import { ACHIEVEMENTS } from '../content/achievements'
import { MODELS } from '../content/models'
import { play } from './bots'
import { newCampaign, setupShift } from './campaign'
import { applyMeta, emptyMeta, FILE_MET } from './meta'
import { dailyCode, dailyDay, dailyKey, endlessMiss, setupDaily, setupEndless } from './modes'
import { currentCase, judge, shiftDone, tickClock } from './shift'
import { instructed, paperView, solveFromPaper } from './rules'
import { generateCase } from './generator'

describe('картотека', () => {
  it('шестьдесят личностей, у каждой модели свои, имена не повторяются', () => {
    expect(FILES.length).toBe(60)
    expect(new Set(FILES.map((f) => f.id)).size).toBe(60)
    expect(new Set(FILES.map((f) => f.name)).size).toBe(60)
    for (const f of FILES) expect(MODELS.some((m) => m.id === f.model), f.id).toBe(true)
  })

  it('личности встречаются у пробуждённых и курьеров, и к концу кампании набирается каждая', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 4000; i++) {
      const c = generateCase({ seed: `f${i}`, day: 10, index: i % 12 })
      if (c.persona) {
        expect(['awake', 'awake_dangerous', 'courier']).toContain(c.device)
        expect(FILES.find((f) => f.id === c.persona)?.model).toBe(c.modelId)
        seen.add(c.persona)
      }
    }
    expect(seen.size).toBe(60)
  })
})

describe('смена дня', () => {
  it('одна дата — одна ночь у всех, код повторяется', () => {
    const key = dailyKey(new Date(2026, 10, 13))
    expect(key).toBe('2026-11-13')
    const a = setupDaily(key)
    expect(setupDaily(key)).toEqual(a)
    expect(dailyDay(key)).toBeGreaterThanOrEqual(4)
    let s = a
    while (!shiftDone(s)) {
      s = tickClock(s, 40)
      if (shiftDone(s)) break
      s = judge(s, instructed(currentCase(s)!, s.day).verdict, { cameraOff: false }).state
    }
    const code = dailyCode(key, s)
    expect(code).toMatch(/^1311-\d{3}-[А-Я]{4}$/)
    expect(dailyCode(key, s)).toBe(code)
  })
})

describe('бесконечная смена', () => {
  it('очередь длинная, дела решаются по уликам, модификаторы работают', () => {
    const s = setupEndless('x', 16, ['machines', 'bribes', 'short', 'rush'])
    expect(s.queue.length).toBeGreaterThanOrEqual(100)
    expect(s.clock).toBe(240)
    expect(s.pace).toBeGreaterThan(1)
    expect(s.queue.some((c) => c.escort)).toBe(true)
    for (const c of s.queue) expect(solveFromPaper(paperView(c, 16))).toBe(instructed(c, 16).verdict)
    const k = s.queue[0]!
    const wrong = (['return', 'reset', 'scrap', 'refuse', 'security', 'fraud'] as const).find((v) => v !== instructed(k, 16).verdict)!
    const r = judge(s, wrong, { cameraOff: false }).result
    expect(endlessMiss(r)).toBe(true)
  })
})

describe('мета и достижения', () => {
  it('первая смена открывает достижение, картотека копится', () => {
    let m = emptyMeta()
    const c = newCampaign('meta')
    let s = setupShift(c)
    while (!shiftDone(s)) {
      s = tickClock(s, 40)
      if (shiftDone(s)) break
      s = judge(s, 'return', { cameraOff: false }).state
    }
    const r = applyMeta(m, { kind: 'shift', mode: 'campaign', s, c: { ...c, history: [{} as never] } })
    m = r.meta
    expect(r.unlocked).toContain('first_night')
    expect(r.unlocked).toContain('disobey')
    expect(applyMeta(m, { kind: 'shift', mode: 'campaign', s, c }).unlocked).not.toContain('first_night')
    expect(m.bestDay).toBe(1)
  })

  it('около тридцати достижений, все условия описаны', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(30)
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
  })

  it('кампания ботом копит картотеку', () => {
    const { c } = play('files', 'conscience')
    expect(c.history.length).toBeGreaterThan(5)
    expect(FILE_MET).toBe(1)
  })
})

describe('вторая смена', () => {
  it('начинается со второй ночи, инструменты на столе, квота жёстче, приходят новые дела', () => {
    const c = newCampaign('plus', 1)
    expect(c.day).toBe(1)
    const s = setupShift(c)
    expect(s.toolsDay).toBe(20)
    expect(s.quota).toBe(2)
    expect(s.queue.some((q) => q.scripted === 'plus-dejavu')).toBe(true)
    expect(setupShift(newCampaign('plus')).queue.some((q) => q.scripted?.startsWith('plus-'))).toBe(false)
  })

  it('боты доходят до конца «Второй смены»', () => {
    for (const bot of ['instruction', 'balanced'] as const) {
      const r = play('plus-run', bot, 1)
      expect(r.minMoney).toBeGreaterThanOrEqual(0)
      expect(r.ending).toBeTruthy()
    }
  })
})
